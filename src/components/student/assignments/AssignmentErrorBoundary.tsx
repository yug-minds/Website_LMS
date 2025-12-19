'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card } from '../../ui/card'
import { Button } from '../../ui/button'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class AssignmentErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Assignment error caught by boundary:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <Card className="p-6">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-gray-600 mb-4">
              We encountered an error while loading this assignment. Please try again.
            </p>
            {this.state.error && process.env.NODE_ENV === 'development' && (
              <details className="mb-4 text-left">
                <summary className="cursor-pointer text-sm text-gray-500">Error details</summary>
                <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="flex justify-center space-x-3">
              <Button onClick={this.handleReset} variant="outline">
                Try Again
              </Button>
              <Button onClick={() => window.location.href = '/student/assignments'}>
                Back to Assignments
              </Button>
            </div>
          </div>
        </Card>
      )
    }

    return this.props.children
  }
}


















