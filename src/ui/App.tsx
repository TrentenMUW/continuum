import { useEffect } from "react";
import { initApp, useAppState } from "../state/appStore";
import { Toolbar } from "./Toolbar/Toolbar";
import styles from "./App.module.css";

export function App() {
  const status = useAppState((s) => s.status);
  const errorMessage = useAppState((s) => (s.status === "error" ? s.message : null));

  useEffect(() => {
    void initApp();
  }, []);

  return (
    <div className={styles.app}>
      <Toolbar live={false} />
      <main className={styles.main} aria-busy={status === "loading"}>
        {status === "error" && (
          <p role="alert" className={styles.message}>
            Couldn't open local storage: {errorMessage}
          </p>
        )}
      </main>
    </div>
  );
}
