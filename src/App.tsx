import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CoachApp } from "./components/CoachApp";
import { FloatApp } from "./components/FloatApp";
import { MainApp } from "./components/MainApp";
import { useAppData } from "./store";
import { applyTheme } from "./theme";
import { TipProvider } from "./components/ui";

const label = getCurrentWindow().label;
const isFloat = label === "float";
/** Coach's popup: a small always-on-top window styled like the floating list. */
const isCoach = label === "coach";
document.documentElement.classList.toggle("is-float", isFloat || isCoach);
document.documentElement.classList.toggle("is-coach", isCoach);

export default function App() {
  const { data, update, saveError, loadError } = useAppData();
  const theme = data?.settings.theme;
  const density = data?.settings.density;

  useEffect(() => {
    if (density) document.documentElement.dataset.density = density;
  }, [density]);

  useEffect(() => {
    if (!theme) return;
    applyTheme(theme, isFloat || isCoach);
    // Calm and Fluent follow Windows' light or dark mode, so apply again when it changes.
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const reapply = () => applyTheme(theme, isFloat || isCoach);
    scheme.addEventListener("change", reapply);
    return () => scheme.removeEventListener("change", reapply);
  }, [theme]);

  if (!data) {
    return loadError ? (
      <p className="empty">
        Couldn't load your reminders: {loadError}
        <br />
        <button onClick={() => window.location.reload()}>Try again</button>
      </p>
    ) : null;
  }
  return (
    <TipProvider>
      {isCoach ? (
        <CoachApp data={data} />
      ) : isFloat ? (
        <FloatApp data={data} update={update} />
      ) : (
        <MainApp data={data} update={update} saveError={saveError} />
      )}
    </TipProvider>
  );
}
