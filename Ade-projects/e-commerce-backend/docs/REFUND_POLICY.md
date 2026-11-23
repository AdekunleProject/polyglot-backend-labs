# Refund and replacement policy

This is the policy the refund workflow implements. The numbers are set in `.env`.

## Damaged, faulty or incorrect item

If an item arrives damaged, faulty, defective, or different from what was ordered, the customer may get a full refund (no deductions) or a replacement at no cost.

1. **Report it.** The customer files a complaint in the app within `REFUND_CLAIM_HOURS` (24) hours of delivery. It must have a written description and clear photos or a video.
2. **Verify it.** A manager or admin reviews the report and evidence. If needed, the item is collected for inspection.
3. **Choose.** If confirmed, the customer chooses a replacement or a full refund.

| Time since delivery | What can be requested |
| --- | --- |
| Within 24 hours | Refund or replacement |
| 24 to 72 hours | Replacement only |
| After 72 hours | Nothing |

## Changed your mind before delivery

A cancellation requested before the order arrives returns `CANCELLATION_REFUND_PERCENT` (65) percent. The rest is the cancellation fee.

## Not refundable

Damage caused by the customer, size or fit (stated in the listing), or a change of mind after delivery.

## Who does what

- Manager: reviews the evidence and records a verification result and note.
- Admin: makes the final refund decision and issues the money.
- Superadmin: sees every decision in the audit log and reports.
