import { Component, type ErrorInfo, type ReactNode } from "react";
import styles from "./App.module.css";

interface Props {
  children: ReactNode;
  /** What failed, e.g. "the timeline". */
  what: string;
}

/** If drawing fails, say so plainly instead of leaving a blank screen. Saved data is untouched. */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Continuum: ${this.props.what} failed to draw`, error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className={styles.failure}>
        <h2>Something went wrong drawing {this.props.what}.</h2>
        <p>Your data is still saved in this browser. Reloading usually fixes this.</p>
        <p className={styles.detail}>{this.state.error.message}</p>
        <button type="button" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
