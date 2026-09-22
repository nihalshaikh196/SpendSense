import { Component } from 'react';
import { logError } from '../lib/log.js';

/**
 * Catches render errors in the page below it so one broken view shows a
 * recovery message instead of blanking the whole app. Keyed by route in
 * App, so navigating elsewhere clears the error.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    logError('Render error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="page-container">
        <div className="glass-card empty-state" role="alert">
          <div className="empty-state-icon">⚠️</div>
          <h2>Something went wrong</h2>
          <p className="empty-state-text">
            This page hit an error. Your expenses are safe — they're stored on this device.
          </p>
          <button className="btn-accent" onClick={() => window.location.reload()}>
            Reload SpendSense
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
