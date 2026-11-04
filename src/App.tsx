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
    if (theme) applyTheme(theme, isFloat);
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
