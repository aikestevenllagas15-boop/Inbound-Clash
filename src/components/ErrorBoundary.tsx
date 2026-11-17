import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button, Surface } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected arena error.' };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Inkbound Clash error:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
          <Surface className="w-full max-w-md space-y-4 p-6" role="alert">
            <h1 className="font-display text-2xl font-semibold">Arena Interrupted</h1>
            <p className="text-sm text-muted">{this.state.message}</p>
            <Button onClick={() => window.location.reload()}>Reload Arena</Button>
          </Surface>
        </main>
      );
    }

    return this.props.children;
  }
}
