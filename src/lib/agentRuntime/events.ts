// CONTRACT: C2  // SEAM: agent-event-outbox
/**
 * Agent-task event emission. Every runtime action step is a PHI-safe C2 event.
 * The runtime emits ONLY the pre-allocated types (AGENT_C2_EVENT_TYPES); an
 * attempt to emit anything else throws UnallowedAgentEventError.
 *
 * In-memory sink for tests. The production drop-in is the outbox writer (ADR-006):
 * the SEAM anchor below marks where an outbox-backed sink adapts an AgentTaskEvent
 * onto a C2 envelope (partitionKey = memberId, class 'stream'). The outbox stays
 * the single way a domain event is born; this module never dual-writes.
 */
import {
  AGENT_C2_EVENT_TYPES,
  UnallowedAgentEventError,
  type AgentC2EventType,
  type AgentEventSink,
  type AgentTaskEvent,
} from './types';

const ALLOWED = new Set<string>(AGENT_C2_EVENT_TYPES);

/** Guard: throw unless the type is one of the pre-allocated agent-task types. */
export function assertAllowedEventType(eventType: string): asserts eventType is AgentC2EventType {
  if (!ALLOWED.has(eventType)) throw new UnallowedAgentEventError(eventType);
}

/** Build a PHI-safe agent-task event (partitionKey = memberId). */
export function buildAgentEvent(input: {
  eventType: AgentC2EventType;
  memberId: string;
  workflowId: string;
  agentId: string;
  occurredAtMs: number;
  correlationId: string;
  proposalId?: string;
  causationId?: string;
  payload?: Record<string, unknown>;
}): AgentTaskEvent {
  assertAllowedEventType(input.eventType);
  const event: AgentTaskEvent = {
    eventType: input.eventType,
    memberId: input.memberId,
    partitionKey: input.memberId,
    workflowId: input.workflowId,
    agentId: input.agentId,
    occurredAtMs: input.occurredAtMs,
    correlationId: input.correlationId,
    payload: input.payload ?? {},
  };
  if (input.proposalId !== undefined) event.proposalId = input.proposalId;
  if (input.causationId !== undefined) event.causationId = input.causationId;
  return event;
}

/** An in-memory event sink that records every emitted event (test + demo mode). */
export interface MemoryEventSink extends AgentEventSink {
  readonly events: AgentTaskEvent[];
  ofType(type: AgentC2EventType): AgentTaskEvent[];
  forMember(memberId: string): AgentTaskEvent[];
  clear(): void;
}

export function createMemoryEventSink(): MemoryEventSink {
  const events: AgentTaskEvent[] = [];
  return {
    events,
    async emit(event: AgentTaskEvent): Promise<void> {
      assertAllowedEventType(event.eventType);
      events.push(event);
    },
    ofType(type) {
      return events.filter((e) => e.eventType === type);
    },
    forMember(memberId) {
      return events.filter((e) => e.memberId === memberId);
    },
    clear() {
      events.length = 0;
    },
  };
}

// SEAM: agent-event-outbox
// Production drop-in: an AgentEventSink whose emit() maps the AgentTaskEvent onto
// an OutboxIntentInput (eventType, memberId, partitionKey=memberId, class:'stream',
// correlationId, PHI-safe payload) and calls OutboxWriter.submit(). The outbox
// remains the single event birth mechanism (ADR-006); no dual-write here.
