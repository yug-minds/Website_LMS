"use client";

import React, { useEffect, useState } from 'react';
import { AlertCircle, X, LogIn } from 'lucide-react';

interface SessionAlertProps {
  show: boolean;
  reason?: string;
  message?: string;
  onDismiss?: () => void;
  onLogin?: () => void;
}

export function SessionAlert({ show, reason, message, onDismiss, onLogin }: SessionAlertProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (show) {
      // Small delay before showing to allow for animation
      const timer = setTimeout(() => setIsVisible(true), 100);
      return () => clearTimeout(timer);
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsVisible(false);
    }
  }, [show]);

  if (!show) return null;

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
    } else {
      window.location.href = '/login';
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    if (onDismiss) {
      setTimeout(onDismiss, 300); // Wait for animation
    }
  };

  const getAlertStyle = () => {
    switch (reason) {
      case 'SESSION_SUPERSEDED':
        return {
          bgColor: 'bg-amber-50',
          borderColor: 'border-amber-200',
          iconColor: 'text-amber-600',
          titleColor: 'text-amber-800',
          textColor: 'text-amber-700'
        };
      case 'SESSION_EXPIRED':
        return {
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200',
          iconColor: 'text-blue-600',
          titleColor: 'text-blue-800',
          textColor: 'text-blue-700'
        };
      default:
        return {
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          iconColor: 'text-red-600',
          titleColor: 'text-red-800',
          textColor: 'text-red-700'
        };
    }
  };

  const getTitle = () => {
    switch (reason) {
      case 'SESSION_SUPERSEDED':
        return 'Logged Out from Another Device';
      case 'SESSION_EXPIRED':
        return 'Session Expired';
      case 'NO_SESSION':
        return 'Session Required';
      default:
        return 'Session Ended';
    }
  };

  const defaultMessage = () => {
    switch (reason) {
      case 'SESSION_SUPERSEDED':
        return 'You were logged out because someone logged in from another device. For security, only one active session is allowed at a time.';
      case 'SESSION_EXPIRED':
        return 'Your session has expired. Please log in again to continue.';
      case 'NO_SESSION':
        return 'Please log in to access this page.';
      default:
        return 'Your session is no longer valid. Please log in again.';
    }
  };

  const style = getAlertStyle();

  return (
    <div 
      className={`
        fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm
        transition-opacity duration-300
        ${isVisible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <div 
        className={`
          relative w-full max-w-md ${style.bgColor} ${style.borderColor} border-2 rounded-xl shadow-2xl p-6
          transform transition-all duration-300
          ${isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}
        `}
      >
        {/* Close button */}
        {onDismiss && (
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-200/50 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        )}

        {/* Icon */}
        <div className="flex items-center justify-center mb-4">
          <div className={`p-3 rounded-full ${style.bgColor}`}>
            <AlertCircle className={`h-8 w-8 ${style.iconColor}`} />
          </div>
        </div>

        {/* Title */}
        <h2 className={`text-xl font-bold text-center ${style.titleColor} mb-2`}>
          {getTitle()}
        </h2>

        {/* Message */}
        <p className={`text-center ${style.textColor} mb-6`}>
          {message || defaultMessage()}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <LogIn className="h-5 w-5" />
            Log In Again
          </button>
          
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="w-full px-4 py-2 text-gray-600 rounded-lg font-medium hover:bg-gray-100 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>

        {/* Security note */}
        {reason === 'SESSION_SUPERSEDED' && (
          <p className="mt-4 text-xs text-center text-gray-500">
            If you didn&apos;t log in from another device, please change your password immediately.
          </p>
        )}
      </div>
    </div>
  );
}

// Hook to use session alert easily
export function useSessionAlert() {
  const [alertState, setAlertState] = useState<{
    show: boolean;
    reason?: string;
    message?: string;
  }>({ show: false });

  const showAlert = (reason?: string, message?: string) => {
    setAlertState({ show: true, reason, message });
  };

  const hideAlert = () => {
    setAlertState({ show: false });
  };

  return {
    alertState,
    showAlert,
    hideAlert,
    SessionAlertComponent: (
      <SessionAlert 
        show={alertState.show}
        reason={alertState.reason}
        message={alertState.message}
        onDismiss={hideAlert}
      />
    )
  };
}

