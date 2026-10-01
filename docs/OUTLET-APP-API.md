# Outlet Orders app — Firebase integration

Region for callables: **`us-central1`** by default — must match Firestore (`firebase/functions/src/region.ts`).

## Authentication

- Firebase Auth email/password.
- After login, call **`getOrdersAppProfile`** once per session to load outlet id/name and roles from `app_users/{uid}`.

## Firestore reads (client)

Security rules allow an authenticated outlet user to **read**:

- `app_users/{their uid}`
- `catalog_lines` where `outletId` matches their profile
- `outlet_orders` where `outletId` matches their profile

All **writes** to orders go through callables (rules deny client writes on orders).

## Callable functions

| Callable | Purpose |
|----------|---------|
| `getOrdersAppProfile` | Outlet session after login |
| `listOutletOrderCatalog` | Active catalog lines for the outlet |
| `peekNextOrderNumber` | Preview next order number (optional UI) |
| `placeOutletOrder` | Cart + employee name + signature storage path → status `placed` |
| `listOutletOrders` | `{ statuses: ['accepted','loaded'] }` or `{ statuses: ['completed'] }` |
| `completeOutletOrder` | Driver name + signature path when status is `loaded` → `completed` |
| `getSignatureUploadUrl` | Signed URL to upload PNG before place/complete |
| `health` | Deploy / connectivity check |

### Order statuses (outlet app)

| Status | Outlet UI |
|--------|-----------|
| `placed` | Not in pending list (supervisor accepts elsewhere) |
| `accepted` | Pending orders (read-only detail) |
| `loaded` | Pending + driver sign flow + “on the way” |
| `completed` | Completed orders + PDF path when set |

Supervisor flows (`accept`, `dispatch`) are **not** in this repo yet; set statuses via Admin SDK / future supervisor app.

### `placeOutletOrder` payload (summary)

```json
{
  "employeeName": "Jane Doe",
  "employeeSignaturePath": "signatures/OUTLET1/orders/temp-uuid/employee.png",
  "items": [
    {
      "productId": "SKU-1",
      "variantKey": "",
      "name": "Product",
      "uom": "pc",
      "unitCost": 12.5,
      "qty": 2
    }
  ]
}
```

Returns `{ orderId, orderNumber, status: "placed" }`.

### Currency display

Format amounts in the app as `K x,xxx.xx` (Namibian-style prefix in your spec).

## Storage layout

- `signatures/{outletId}/orders/{orderId}/employee.png`
- `signatures/{outletId}/orders/{orderId}/driver.png`
- `orders/{outletId}/{orderId}.pdf` (upload from app or future PDF function)

Use **`getSignatureUploadUrl`** with `{ path, contentType: "image/png" }` before calling place/complete.
