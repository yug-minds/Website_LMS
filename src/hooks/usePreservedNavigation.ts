"use client";
import { useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/app-store';
import { saveComponentState, getComponentIdFromPath } from '../lib/navigation-preservation';

export function usePreservedNavigation(options: any = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { getStateToSave, componentId } = options;
  const appStore = useAppStore();
  const currentIdRef = useRef(componentId || getComponentIdFromPath(pathname));
  
  useEffect(() => {
    currentIdRef.current = componentId || getComponentIdFromPath(pathname);
  }, [pathname, componentId]);

  const push = useCallback((href: string) => {
    if (getStateToSave) {
      const state = getStateToSave();
      if (state) saveComponentState(currentIdRef.current, state);
    }
    appStore.setCurrentRoute(href);
    router.push(href);
  }, [getStateToSave, router, appStore]);
  
  const replace = useCallback((href: string) => {
    if (getStateToSave) {
      const state = getStateToSave();
      if (state) saveComponentState(currentIdRef.current, state);
    }
    appStore.setCurrentRoute(href);
    router.replace(href);
  }, [getStateToSave, router, appStore]);
  
  return { push, replace, back: router.back, forward: router.forward, refresh: router.refresh };
}
