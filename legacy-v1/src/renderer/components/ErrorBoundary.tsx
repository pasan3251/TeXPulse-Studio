import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Renderer failed.", error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="fatal-error" role="alert">
          <p className="eyebrow">TeXPulse Studio</p>
          <h1>The editor could not render.</h1>
          <p>Your project files were not changed. Close and reopen the app.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
