import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Optional label shown in the fallback UI, e.g. "ASL Recognizer" */
  label?: string
  /** Called when an error is caught — useful for surfacing status to parent */
  onError?: (error: Error) => void
}

type State = {
  error: Error | null
}

/**
 * Catches render/lifecycle errors in any child tree so a single model crash
 * doesn't take down the whole UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label ?? 'unknown', error, info)
    this.props.onError?.(error)
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="errorBoundary" role="alert" aria-live="assertive">
          <div className="errorText">
            {this.props.label ? `${this.props.label} crashed: ` : 'Something went wrong: '}
            {this.state.error.message}
          </div>
          <button className="btn" onClick={this.handleRetry} style={{ marginTop: '8px' }}>
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
