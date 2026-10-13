import { useEffect, useRef } from "react";

export type SupervisorPushNavigation = {
  openOrders: (orderId?: string) => void;
  openDeliveryLoading: (orderId?: string) => void;
  openCompletedOrders: (orderId?: string) => void;
  openReturns: (returnId?: string) => void;
};

function routeSupervisorPush(
  data: Record<string, unknown> | undefined,
  nav: SupervisorPushNavigation,
): void {
  const screen = String(data?.screen ?? "");
  const orderId = typeof data?.orderId === "string" ? data.orderId : undefined;
  const returnId = typeof data?.returnId === "string" ? data.returnId : undefined;
  const event = String(data?.event ?? "");

  if (
    screen === "orders" ||
    event === "supervisor_new_order" ||
    (!screen && orderId && !returnId)
  ) {
    nav.openOrders(orderId);
    return;
  }
  if (
    screen === "deliveryLoading" ||
    event === "supervisor_order_dispatched" ||
    event === "supervisor_loading_checklist_done"
  ) {
    nav.openDeliveryLoading(orderId);
    return;
  }
  if (screen === "completedOrders" || event === "supervisor_order_completed" || event === "supervisor_offloading_checklist_done") {
    nav.openCompletedOrders(orderId);
    return;
  }
  if (screen === "returns" || event === "supervisor_return_submitted") {
    nav.openReturns(returnId);
  }
}

export function useSupervisorPushNavigation(nav: SupervisorPushNavigation): void {
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    void (async () => {
      const Notifications = await import("expo-notifications");
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        routeSupervisorPush(
          last.notification.request.content.data as Record<string, unknown>,
          navRef.current,
        );
      }
      sub = Notifications.addNotificationResponseReceivedListener((response) => {
        routeSupervisorPush(
          response.notification.request.content.data as Record<string, unknown>,
          navRef.current,
        );
      });
    })();
    return () => sub?.remove();
  }, []);
}
