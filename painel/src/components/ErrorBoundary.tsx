import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { message: string | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: Error): State {
    return { message: error.message || 'Falha ao renderizar esta tela.' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[painel]', error, info.componentStack);
  }

  render() {
    if (this.state.message) {
      return (
        <div className="card">
          <h1 className="page-title">Algo deu errado</h1>
          <p className="error">{this.state.message}</p>
          <button type="button" className="primary" onClick={() => this.setState({ message: null })}>
            Tentar de novo
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
