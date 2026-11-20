//! Coach's natural voice: Kokoro, running on this PC (docs/adr/0002).
//! The model and voices are downloaded only when Speak is turned on, from one pinned
//! Hugging Face revision, and every file is checked against its SHA-256 before use.
//! Text becomes phonemes with misaki-rs, without espeak-ng (docs/adr/0003); words it
//! doesn't know go through `RuleFallback`.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use misaki_rs::fallback::FallbackError;
use misaki_rs::{Fallback, Language, G2P};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::kokoro_vocab::VOCAB;

/// The Hugging Face revision every file comes from.
const REVISION: &str = "1939ad2a8e416c0acfeecc08a694d14ef25f2231";
const REPO: &str = "onnx-community/Kokoro-82M-v1.0-ONNX";

/// One file Coach's voice needs: where it lives in the repo, its size and its SHA-256.
pub struct VoiceFile {
    pub path: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

pub const MODEL: VoiceFile = VoiceFile {
    path: "onnx/model_quantized.onnx",
    size: 92_361_116,
    sha256: "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478",
};

/// The voices offered in Settings, by Kokoro's name, best-rated first.
pub const VOICES: [(&str, VoiceFile); 5] = [
    ("af_heart", VoiceFile { path: "voices/af_heart.bin", size: 522_240, sha256: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b" }),
    ("af_bella", VoiceFile { path: "voices/af_bella.bin", size: 522_240, sha256: "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b" }),
    ("bf_emma", VoiceFile { path: "voices/bf_emma.bin", size: 522_240, sha256: "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73" }),
    ("am_michael", VoiceFile { path: "voices/am_michael.bin", size: 522_240, sha256: "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1" }),
    ("am_fenrir", VoiceFile { path: "voices/am_fenrir.bin", size: 522_240, sha256: "c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43" }),
];

/// Every file, model first.
pub fn files() -> Vec<&'static VoiceFile> {
    std::iter::once(&MODEL).chain(VOICES.iter().map(|(_, f)| f)).collect()
}

pub fn total_size() -> u64 {
    files().iter().map(|f| f.size).sum()
}

/// Where a file is kept on this PC: just its file name, inside the voice folder.
pub fn local_path(dir: &Path, file: &VoiceFile) -> PathBuf {
    dir.join(file.path.rsplit('/').next().unwrap_or(file.path))
}

fn url(file: &VoiceFile) -> String {
    format!("https://huggingface.co/{REPO}/resolve/{REVISION}/{}", file.path)
}

/// What Settings shows about the voice.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Status {
    None,
    Downloading { done: u64, total: u64 },
    Ready,
    Error { message: String },
}

/// Ready when every file is on disk at its expected size. The full fingerprint check runs
/// before the voice is first used in a session (`verify_all`).
pub fn status_from_disk(dir: &Path) -> Status {
    let present = files().iter().all(|f| fs::metadata(local_path(dir, f)).is_ok_and(|m| m.len() == f.size));
    if present { Status::Ready } else { Status::None }
}

#[cfg(test)]
fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let mut hasher = Sha256::new();
    let mut file = fs::File::open(path)?;
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Whether a file on disk is exactly the one pinned in the manifest.
pub fn verify(dir: &Path, file: &VoiceFile) -> bool {
    sha256_file(&local_path(dir, file)).is_ok_and(|h| h == file.sha256)
}

pub fn verify_all(dir: &Path) -> bool {
    files().iter().all(|f| verify(dir, f))
}

/// Downloads every missing or wrong file into `dir`, checking each against its fingerprint.
/// A file that fails the check is deleted and the download stops with an error.
pub fn download(dir: &Path, mut progress: impl FnMut(u64, u64)) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Couldn't make the voice folder: {e}"))?;
    let total = total_size();
    let mut done = 0u64;
    let client = reqwest::blocking::Client::builder()
        .timeout(None)
        .connect_timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    for file in files() {
        let target = local_path(dir, file);
        if fs::metadata(&target).is_ok_and(|m| m.len() == file.size) && verify(dir, file) {
            done += file.size;
            progress(done, total);
            continue;
        }
        let part = target.with_extension("part");
        let result = (|| -> Result<(), String> {
            let mut response = client.get(url(file)).send().map_err(|_| "Couldn't reach the download. Check your internet connection.".to_string())?;
            if !response.status().is_success() {
                return Err(format!("The download failed ({}).", response.status()));
            }
            let mut out = fs::File::create(&part).map_err(|e| e.to_string())?;
            let mut hasher = Sha256::new();
            let mut buf = vec![0u8; 1 << 16];
            let mut got = 0u64;
            loop {
                let n = response.read(&mut buf).map_err(|_| "The download was interrupted.".to_string())?;
                if n == 0 {
                    break;
                }
                got += n as u64;
                if got > file.size {
                    return Err("A downloaded file was bigger than expected, so it was thrown away.".into());
                }
                hasher.update(&buf[..n]);
                out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
                progress(done + got, total);
            }
            drop(out);
            let hash: String = hasher.finalize().iter().map(|b| format!("{b:02x}")).collect();
            if hash != file.sha256 {
                return Err("A downloaded file didn't match its fingerprint, so it was thrown away.".into());
            }
            fs::rename(&part, &target).map_err(|e| e.to_string())
        })();
        if let Err(message) = result {
            let _ = fs::remove_file(&part);
            return Err(message);
        }
        done += file.size;
        progress(done, total);
    }
    Ok(())
}

/// Deletes the voice folder.
pub fn remove(dir: &Path) -> std::io::Result<()> {
    if dir.exists() { fs::remove_dir_all(dir) } else { Ok(()) }
}

// ---------- Text to phonemes ----------

/// Letter names, for words spelled out.
const LETTERS: [&str; 26] = [
    "ˈA", "bˈi", "sˈi", "dˈi", "ˈi", "ˈɛf", "ʤˈi", "ˈAʧ", "ˈI", "ʤˈA", "kˈA", "ˈɛl", "ˈɛm", "ˈɛn", "ˈO", "pˈi", "kjˈu", "ˈɑɹ", "ˈɛs", "tˈi",
    "jˈu", "vˈi", "dˈʌbᵊlju", "ˈɛks", "wˈI", "zˈi",
];

/// Spells a word letter by letter ("PDF").
fn spell(word: &str) -> String {
    word.chars()
        .filter(|c| c.is_ascii_alphabetic())
        .map(|c| LETTERS[(c.to_ascii_lowercase() as u8 - b'a') as usize])
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_vowel(c: char) -> bool {
    matches!(c, 'a' | 'e' | 'i' | 'o' | 'u')
}

/// Simple letter-to-sound rules for words misaki-rs doesn't know: names, brands, other
/// languages. Not English spelling rules in full; good enough to be understood.
/// Short all-caps words, and words without a vowel ("Brgy"), are spelled out.
pub fn rules(word: &str) -> String {
    let clean: String = word.chars().filter(|c| c.is_ascii_alphabetic()).collect();
    if clean.is_empty() {
        return String::new();
    }
    let upper = clean.chars().all(|c| c.is_ascii_uppercase());
    let lower = clean.to_ascii_lowercase();
    if (upper && clean.len() <= 5) || !lower.chars().any(is_vowel) {
        return spell(&clean);
    }
    let chars: Vec<char> = lower.chars().collect();
    let mut out: Vec<(String, bool)> = Vec::new(); // (phonemes, is a vowel sound)
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        let after = chars.get(i + 2).copied();
        // A doubled consonant sounds once.
        if !is_vowel(c) && next == Some(c) {
            i += 1;
            continue;
        }
        let two: String = chars[i..chars.len().min(i + 2)].iter().collect();
        let (sound, len, vowel) = match two.as_str() {
            "ch" => ("ʧ", 2, false),
            "sh" => ("ʃ", 2, false),
            "th" => ("θ", 2, false),
            "ph" => ("f", 2, false),
            "ng" => ("ŋ", 2, false),
            "ck" => ("k", 2, false),
            "qu" => ("kw", 2, false),
            "ee" | "ea" => ("i", 2, true),
            "oo" => ("u", 2, true),
            "ou" => ("W", 2, true),
            "ai" | "ay" => ("A", 2, true),
            "oi" | "oy" => ("Y", 2, true),
            _ => {
                // A vowel followed by one consonant sound and a vowel, or ending the word, is open.
                // "sh", "ch", "th", "ph" and "ng" count as one consonant.
                let digraph = matches!((next, after), (Some(a), Some('h')) if matches!(a, 's' | 'c' | 't' | 'p')) || (next, after) == (Some('n'), Some('g'));
                let after = if digraph { chars.get(i + 3).copied() } else { after };
                let open = next.is_none_or(is_vowel) || (next.is_some_and(|n| !is_vowel(n)) && after.is_some_and(is_vowel));
                match c {
                    'a' => (if open { "ɑ" } else { "æ" }, 1, true),
                    'e' => (if next.is_none() && i > 0 { "" } else if open { "ɛ" } else { "ɛ" }, 1, true),
                    'i' => (if open { "i" } else { "ɪ" }, 1, true),
                    'o' => (if open { "O" } else { "ɑ" }, 1, true),
                    'u' => (if open { "u" } else { "ʌ" }, 1, true),
                    // A "y" starting a word or before a vowel sounds like "j".
                    'y' if i == 0 || next.is_some_and(is_vowel) => ("j", 1, false),
                    'y' => ("i", 1, true),
                    'c' if next.is_some_and(|n| matches!(n, 'e' | 'i' | 'y')) => ("s", 1, false),
                    'c' => ("k", 1, false),
                    'g' => ("ɡ", 1, false),
                    'j' => ("ʤ", 1, false),
                    'r' => ("ɹ", 1, false),
                    'x' => ("ks", 1, false),
                    'q' => ("k", 1, false),
                    other => {
                        out.push((other.to_string(), false));
                        i += 1;
                        continue;
                    }
                }
            }
        };
        if !sound.is_empty() {
            out.push((sound.to_string(), vowel));
        }
        i += len;
    }
    // Stress the first vowel of a short word, else the second-to-last (as in many names).
    let vowels: Vec<usize> = out.iter().enumerate().filter(|(_, (_, v))| *v).map(|(i, _)| i).collect();
    let stressed = match vowels.len() {
        0 => None,
        1 | 2 => Some(vowels[0]),
        n => Some(vowels[n - 2]),
    };
    out.iter()
        .enumerate()
        .map(|(i, (s, _))| if Some(i) == stressed { format!("ˈ{s}") } else { s.clone() })
        .collect()
}

/// misaki-rs's fallback for unknown words: the letter-to-sound `rules`.
struct RuleFallback;

impl Fallback for RuleFallback {
    fn phonemize(&self, word: &str) -> Result<String, FallbackError> {
        let p = rules(word);
        if p.is_empty() { Err(FallbackError::NoPhonemes { word: word.to_string() }) } else { Ok(p) }
    }
}

/// Kokoro's ids for a phoneme string, padded with 0 at both ends. Unknown characters are
/// dropped, as Kokoro's own tokenizer does, and it's capped at Kokoro's 510 tokens.
pub fn token_ids(phonemes: &str) -> Vec<i64> {
    let mut ids = vec![0];
    for c in phonemes.chars() {
        if let Some((_, id)) = VOCAB.iter().find(|(v, _)| *v == c) {
            if ids.len() < 511 {
                ids.push(*id);
            }
        }
    }
    ids.push(0);
    ids
}

// ---------- The engine ----------

pub struct Engine {
    _env: ort::environment::Environment,
    session: ort::session::Session,
    us: G2P,
    gb: G2P,
}

impl Engine {
    /// Loads the model. Slow (a second or two), so it's done once and kept.
    pub fn load(dir: &Path) -> Result<Engine, String> {
        let env = ort::init().build().map_err(|e| e.to_string())?;
        let session = ort::session::Session::builder(&env)
            .and_then(|mut b| b.commit_from_file(local_path(dir, &MODEL)))
            .map_err(|e| format!("Couldn't load the voice: {e}"))?;
        Ok(Engine {
            _env: env,
            session,
            us: G2P::with_fallback(Language::EnglishUS, Some(Box::new(RuleFallback))),
            gb: G2P::with_fallback(Language::EnglishGB, Some(Box::new(RuleFallback))),
        })
    }

    /// The phonemes for `text`, in the voice's accent.
    pub fn phonemes(&self, text: &str, british: bool) -> String {
        let g2p = if british { &self.gb } else { &self.us };
        g2p.g2p(text).map(|(p, _)| p.replace('❓', "")).unwrap_or_default()
    }

    /// Speaks `text` with `voice` at `speed`: 24 kHz mono samples.
    pub fn speak(&mut self, dir: &Path, text: &str, voice: &str, speed: f32) -> Result<Vec<f32>, String> {
        let (_, file) = VOICES.iter().find(|(name, _)| *name == voice).unwrap_or(&VOICES[0]);
        let phonemes = self.phonemes(text, voice.starts_with('b'));
        let ids = token_ids(&phonemes);
        // The voice file holds one 256-number style per input length; use this line's.
        let bytes = fs::read(local_path(dir, file)).map_err(|e| e.to_string())?;
        let styles: Vec<f32> = bytes.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect();
        let row = (ids.len() - 2).min(styles.len() / 256 - 1);
        let style = styles[row * 256..row * 256 + 256].to_vec();
        let n = ids.len();
        let inputs = ort::inputs![
            "input_ids" => ort::value::Tensor::from_array(([1usize, n], ids)).map_err(|e| e.to_string())?,
            "style" => ort::value::Tensor::from_array(([1usize, 256], style)).map_err(|e| e.to_string())?,
            "speed" => ort::value::Tensor::from_array(([1usize], vec![speed.clamp(0.5, 2.0)])).map_err(|e| e.to_string())?,
        ];
        let outputs = self.session.run(inputs).map_err(|e| format!("Couldn't speak: {e}"))?;
        let (_, samples) = outputs[0].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
        Ok(samples.to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_spell_short_capitals_and_words_without_vowels() {
        assert_eq!(rules("PDF"), "pˈi dˈi ˈɛf");
        assert_eq!(rules("Brgy"), rules("BRGY"));
        assert!(rules("Brgy").starts_with("bˈi"));
    }

    #[test]
    fn rules_sound_out_names_with_stress() {
        assert_eq!(rules("Reddit"), "ɹˈɛdɪt");
        assert_eq!(rules("Malinta"), "mɑlˈɪntɑ");
        assert_eq!(rules("Kiyoshi"), "kijˈOʃi");
        assert!(rules("Tok").contains('ɑ'));
    }

    #[test]
    fn every_rule_sound_is_a_kokoro_token() {
        for word in ["Reddit", "Malinta", "Kiyoshi", "Tok", "Brgy", "Zhou", "Xavier", "Quezon", "Ngozi", "Phuket", "PDF"] {
            let p = rules(word);
            let known = p.chars().filter(|c| *c != ' ').all(|c| VOCAB.iter().any(|(v, _)| *v == c));
            assert!(known, "{word} -> {p} has a sound Kokoro doesn't know");
        }
    }

    #[test]
    fn token_ids_pad_both_ends_and_drop_unknowns() {
        let ids = token_ids("hˈɛlO❓");
        assert_eq!(ids.first(), Some(&0));
        assert_eq!(ids.last(), Some(&0));
        assert_eq!(ids.len(), 2 + 5);
        assert_eq!(token_ids(&"a".repeat(600)).len(), 512);
    }

    #[test]
    fn the_manifest_pins_every_file() {
        assert_eq!(files().len(), 6);
        assert!(files().iter().all(|f| f.sha256.len() == 64));
        assert_eq!(total_size(), 92_361_116 + 5 * 522_240);
        assert!(url(&MODEL).contains(REVISION));
    }

    #[test]
    fn status_and_verification_read_the_folder() {
        let dir = std::env::temp_dir().join(format!("remme-voice-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(status_from_disk(&dir), Status::None);
        fs::create_dir_all(&dir).unwrap();
        // Right size but the wrong bytes: present, but it fails the fingerprint check.
        let (_, heart) = &VOICES[0];
        fs::write(local_path(&dir, heart), vec![7u8; heart.size as usize]).unwrap();
        assert!(!verify(&dir, heart));
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        let _ = fs::remove_dir_all(&dir);
    }
}

/// End to end, against the real download: `REMME_VOICE_DIR=<folder> cargo test real_voice -- --ignored`.
/// Writes `sample-<voice>.wav` into that folder.
#[cfg(test)]
mod real {
    use super::*;

    fn wav(path: &Path, samples: &[f32]) {
        let mut out = Vec::new();
        let data_len = (samples.len() * 2) as u32;
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVEfmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&24_000u32.to_le_bytes());
        out.extend_from_slice(&48_000u32.to_le_bytes());
        out.extend_from_slice(&2u16.to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());
        for s in samples {
            out.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes());
        }
        fs::write(path, out).unwrap();
    }

    #[test]
    #[ignore]
    fn real_voice() {
        let dir = PathBuf::from(std::env::var("REMME_VOICE_DIR").expect("set REMME_VOICE_DIR"));
        download(&dir, |_, _| {}).unwrap();
        assert!(verify_all(&dir));
        let mut engine = Engine::load(&dir).unwrap();
        for (voice, line) in [
            ("af_heart", "You're not tired. You're avoiding Lab report."),
            ("am_fenrir", "How can you have dreams if you ain't even doing anything?"),
            ("bf_emma", "Quick check: Call Kiyoshi about Reddit is waiting."),
        ] {
            let started = std::time::Instant::now();
            let samples = engine.speak(&dir, line, voice, 1.0).unwrap();
            println!("{voice}: {:.1}s of audio in {:?}  [{}]", samples.len() as f32 / 24_000.0, started.elapsed(), engine.phonemes(line, voice.starts_with('b')));
            assert!(samples.len() > 24_000);
            wav(&dir.join(format!("sample-{voice}.wav")), &samples);
        }
    }
}
