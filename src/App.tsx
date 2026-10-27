import { getCurrentWindow } from "@tauri-apps/api/window";
import { FloatApp } from "./components/FloatApp";
import { MainApp } from "./components/MainApp";
import { useAppData } from "./store";

const isFloat = getCurrentWindow().label === "float";
document.documentElement.classList.toggle("is-float", isFloat);

export default function App() {
  const { data, update, saveError } = useAppData();
  if (!data) return null;
  return isFloat ? (
    <FloatApp data={data} update={update} />
  ) : (
    <MainApp data={data} update={update} saveError={saveError} />
  );
}
