import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { FloatApp } from "./components/FloatApp";
import { MainApp } from "./components/MainApp";
import { useAppData } from "./store";
import { applyTheme } from "./theme";

const isFloat = getCurrentWindow().label === "float";
document.documentElement.classList.toggle("is-float", isFloat);

export default function App() {
  const { data, update, saveError, loadError } = useAppData();
  const theme = data?.settings.theme;

  useEffect(() => {
    if (!theme) return;
    applyTheme(theme, isFloat);
    // Calm and Fluent follow Windows' light or dark mode, so apply again when it changes.
    const scheme = window.matchMedia("(prefers-color-scheme: dark)");
    const reapply = () => applyTheme(theme, isFloat);
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
  return isFloat ? (
    <FloatApp data={data} update={update} />
  ) : (
    <MainApp data={data} update={update} saveError={saveError} />
  );
}
