// The demo catalogue.
//
// Worked examples only: complete architectures that carry declared
// requirements the checker actually has something to say about. A
// fragment that parses but declares nothing teaches nothing here — the
// blank model is the place to start from nothing, and it starts from
// nothing entirely.
//
// The examples are imported from the vendored conseqa tree rather than
// copied, so they track the DSL as it changes.

import flashCheckout from "../../vendor/conseqa/tests/fixtures/flash_checkout.yaml?raw";
import paymentCapture from "../../vendor/conseqa/tests/fixtures/payment_capture.yaml?raw";
import tenantLedger from "../../vendor/conseqa/tests/fixtures/tenant_ledger.yaml?raw";
import transactionalOutbox from "../../vendor/conseqa/tests/fixtures/transactional_outbox.yaml?raw";
import videoStreaming from "../../vendor/conseqa/tests/fixtures/video_streaming.yaml?raw";
import blank from "./models/blank.yaml?raw";

export interface CatalogEntry {
  id: string;
  title: string;
  /** One line for the picker. */
  blurb: string;
  /** What to look for once it is open. */
  notes: string[];
  /** Where the source comes from, shown above the editor. */
  path: string;
  source: string;
  /** How this entry exercises the checker. */
  expect: "proven" | "unknown" | "blank";
}

export const CATALOG: CatalogEntry[] = [
  {
    id: "flash_checkout",
    title: "Flash checkout",
    blurb: "Orders, inventory reservation, and card payments across three services — the canonical worked example.",
    notes: [
      "Six operations in three services share one keyed topic; the order object is versioned, so a stale observation rejects at commit rather than writes — the OCC route the serializability and ordering proofs ride on.",
      "The checker proves 6 obligations and leaves 5 unknown — the model's deliberate gaps: tx.reserve_inventory reads stock and writes it back with neither lock nor version (the write-skew shape), and the undeduplicated card charge fixes no terminal result for a retry to replay.",
      "Open the Obligations panel, filter to unknown, and follow the evidence into operation.reserve_inventory.",
    ],
    path: "tests/fixtures/flash_checkout.yaml",
    source: flashCheckout,
    expect: "unknown",
  },
  {
    id: "video_streaming",
    title: "Video streaming",
    blurb: "Upload, transcode, publish, and notify — a pipeline whose every obligation is proven.",
    notes: [
      "Four services, five operations, and two state machines (video and transcode-job lifecycles) driven through transitions — every transition can reject, and each transaction says what the operation does then.",
      "All 12 obligations are proven: every state change is a keyed commit, every event is identified, and the transcode engine deduplicates renders by video_id, fixing each video's terminal result.",
      "Open operation.transcode_video from the navigator to see its program branch on the engine's result and the transactions that take machine transitions.",
    ],
    path: "tests/fixtures/video_streaming.yaml",
    source: videoStreaming,
    expect: "proven",
  },
  {
    id: "transactional_outbox",
    title: "Transactional outbox",
    blurb: "Create an order and admit its event in one atomic commit; a relay publishes, a projector consumes — the canonical pattern at its smallest.",
    notes: [
      "One commit rules out both dual-write failures: an order recorded without OrderCreated, or OrderCreated emitted without the order.",
      "All 6 obligations are proven: the producer's keyed commit discharges the duplicate outbox write, the relay keys its idempotency from the message identity the propagation carries, and the outbox's intrinsic re-drive guarantees its completion.",
      "The relay's partitioning, consistent-hash routing, and serial pool live under runtime — placement and transport facts on which no proof rests.",
    ],
    path: "tests/fixtures/transactional_outbox.yaml",
    source: transactionalOutbox,
    expect: "proven",
  },
  {
    id: "payment_capture",
    title: "Payment capture",
    blurb: "Stripe-style payment capture through a transactional outbox — the pattern's textbook habitat.",
    notes: [
      "An unmodeled checkout retries capture_payment with the same idempotency_key; the transaction deduplicates commits by that key, so however often it retries there is at most one recorded payment and one admitted PaymentCaptured.",
      "All 8 obligations are proven: the ledger posts a double-entry record by keyed commit driven to completion, and the receipts provider deduplicates sends — both keyed from event_id.",
      "The outbox is the honest answer to the dual write: a payment recorded without its event stops the books balancing, an event without its record invents money.",
    ],
    path: "tests/fixtures/payment_capture.yaml",
    source: paymentCapture,
    expect: "proven",
  },
  {
    id: "tenant_ledger",
    title: "Tenant ledger",
    blurb: "Partitioned stores, a per-tenant outbox, and ledger writes proven to apply in per-tenant sequence order.",
    notes: [
      "The producer assigns each entry's per-tenant sequence inside its transaction — lock the tenant row, read the last sequence, write the successor, insert the entry, stage the admission — one commit, so the sequence and the event agree.",
      "All 12 obligations are proven, and the ordering proof is the ledger transaction itself: it validates the version it observed, advances last_applied_sequence by the successor rule, and rejects anything stale, duplicate, or out of order.",
      "The transport keeps per-tenant order too — partitioned outbox, routed relay pool, grouped topic — but those are runtime facts and prove nothing: without the transaction's guard, a redelivery could still present an old event after a newer one.",
    ],
    path: "tests/fixtures/tenant_ledger.yaml",
    source: tenantLedger,
    expect: "proven",
  },
  {
    id: "blank",
    title: "Blank model",
    blurb: "The versioned frame and the six application sections, each of them empty.",
    notes: [
      "dsl: 4 names the contract this model speaks. The parser probes it before reading anything else, and refuses a document that declares none — by name, not as a shape error.",
      "Every section is optional on input and canonical on output: the format button writes all six back, and runtime appears only once L1 placement or transport facts exist.",
      "Declare a service, a schema, and an operation with an input and a program, and the pipeline starts having something to check.",
    ],
    path: "blank.yaml",
    source: blank,
    expect: "blank",
  },
];

export const DEFAULT_ENTRY = CATALOG[0];

export function catalogEntry(id: string | null | undefined): CatalogEntry | undefined {
  return CATALOG.find((entry) => entry.id === id);
}
