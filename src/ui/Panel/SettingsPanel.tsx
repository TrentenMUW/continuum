import { useEffect, useId, useState } from "react";
import { backupFile, updateSettings, type ReadyState } from "../../state/appStore";
import { isIanaZone } from "../../time/zones";
import { downloadText } from "../download";
import styles from "./Panel.module.css";

const REPO_URL = "https://github.com/TrentenMUW/continuum";

type StorageInfo = { persisted: boolean | null; usage: number | null; quota: number | null };

/** Settings (§5.10, §5.11, D16): appearance, time zone, snapping, storage, and About. */
export function SettingsPanel({ state }: { state: ReadyState }) {
  const { settings } = state;
  const ids = useId();
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [zoneText, setZoneText] = useState(settings.timeZone === "auto" ? deviceZone : settings.timeZone);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [storage, setStorage] = useState<StorageInfo>({ persisted: null, usage: null, quota: null });

  const refreshStorage = async () => {
    const s = navigator.storage;
    const [persisted, estimate] = await Promise.all([
      s?.persisted ? s.persisted().catch(() => null) : null,
      s?.estimate ? s.estimate().catch(() => null) : null,
    ]);
    setStorage({ persisted, usage: estimate?.usage ?? null, quota: estimate?.quota ?? null });
  };
  useEffect(() => {
    void refreshStorage();
  }, []);

  const requestPersist = async () => {
    await navigator.storage?.persist?.().catch(() => false);
    await refreshStorage();
  };

  const applyZone = () => {
    const z = zoneText.trim();
    if (!isIanaZone(z) || !z.includes("/")) {
      setZoneError(`“${z}” isn't a time zone name this browser knows. Use a name like America/Los_Angeles.`);
      return;
    }
    setZoneError(null);
    void updateSettings({ timeZone: z });
  };

  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const mb = (bytes: number | null) => (bytes === null ? "unknown" : `${(bytes / 1_048_576).toFixed(1)} MB`);

  return (
    <div className={styles.form}>
      <fieldset className={styles.fieldset}>
        <legend>Appearance</legend>
        {(["dark", "light"] as const).map((t) => (
          <label key={t} className={styles.check}>
            <input type="radio" name={`${ids}-theme`} checked={settings.theme === t} onChange={() => void updateSettings({ theme: t })} />
            {t === "dark" ? "Dark" : "Light"}
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Time</legend>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={settings.timeZone === "auto"}
            onChange={(e) => {
              setZoneError(null);
              void updateSettings({ timeZone: e.target.checked ? "auto" : deviceZone });
              setZoneText(deviceZone);
            }}
          />
          Use this device's time zone ({deviceZone})
        </label>
        {settings.timeZone !== "auto" && (
          <div className={styles.field}>
            <label htmlFor={`${ids}-zone`}>Display time zone</label>
            <div className={styles.categoryMain}>
              <input
                id={`${ids}-zone`}
                list={`${ids}-zones`}
                value={zoneText}
                aria-invalid={!!zoneError}
                onChange={(e) => setZoneText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyZone()}
              />
              <button type="button" onClick={applyZone}>
                Apply
              </button>
            </div>
            <datalist id={`${ids}-zones`}>
              {zones.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            {zoneError && <p className={styles.error}>{zoneError}</p>}
          </div>
        )}
        <p className={styles.muted}>Showing times in {state.zone}. Weeks start on Monday.</p>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Snapping</legend>
        <label className={styles.inline}>
          Snap when within
          <input
            className={styles.short}
            type="number"
            min={1}
            max={40}
            aria-label="Snap threshold in percent"
            value={Math.round(settings.snapThreshold * 100)}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v >= 1 && v <= 40) void updateSettings({ snapThreshold: v / 100 });
            }}
          />
          % of a day, week, month, or year
        </label>
        <p className={styles.muted}>Snapping is {settings.snapEnabled ? "on" : "off"}. Use the Snap button in the toolbar to turn it on or off.</p>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Your data</legend>
        <p>
          Continuum keeps everything in this browser's own storage. Nothing is sent anywhere. Clearing site data, using a private window, or some
          browser clean-up can erase it, so export a backup regularly.
        </p>
        <p role="status">
          Persistent storage:{" "}
          {storage.persisted === null
            ? "not available in this browser"
            : storage.persisted
              ? "granted. The browser won't clear this data on its own."
              : "not granted yet. The browser may clear this data if space runs low."}
        </p>
        <p className={styles.muted}>
          Using {mb(storage.usage)} of about {mb(storage.quota)} available.
        </p>
        <div className={styles.actions}>
          <button type="button" className={styles.primary} onClick={() => void backupFile().then(({ filename, json }) => downloadText(filename, json))}>
            Export a backup
          </button>
          {storage.persisted === false && (
            <button type="button" onClick={() => void requestPersist()}>
              Ask to keep my data
            </button>
          )}
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>About</legend>
        <p>Continuum is a lifelong, continuous timeline: one line where width is duration. There are no accounts and no servers.</p>
        <p>
          Source code:{" "}
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            github.com/TrentenMUW/continuum
          </a>
        </p>
      </fieldset>
    </div>
  );
}
