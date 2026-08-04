import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorFallback } from '@/components/common/ErrorFallback';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return <ErrorFallback error={error} onRetry={() => this.setState({ error: null })} />;
  }
}
