import { useEffect, useRef } from "react";

export type OutletPushNavigation = {
  openViewOrders: () => void;
  openOffloading: () => void;
  openReturns: () => void;
};

function routeOutletPush(
  data: Record<string, unknown> | undefined,
  nav: OutletPushNavigation,
): void {
  const screen = String(data?.screen ?? data?.event ?? "");
  if (screen === "viewOrders" || data?.event === "outlet_order_accepted") {
    nav.openViewOrders();
    return;
  }
  if (screen === "offloading" || data?.event === "outlet_order_loaded") {
    nav.openOffloading();
    return;
  }
  if (screen === "returns" || data?.event === "outlet_return_decided") {
    nav.openReturns();
  }
}

export function useOutletPushNavigation(nav: OutletPushNavigation): void {
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    void (async () => {
      const Notifications = await import("expo-notifications");
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        routeOutletPush(
          last.notification.request.content.data as Record<string, unknown>,
          navRef.current,
        );
      }
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        routeOutletPush(
          response.notification.request.content.data as Record<string, unknown>,
          navRef.current,
        );
      });
    })();
    return () => sub?.remove();
  }, []);
}
