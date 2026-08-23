'use client';
import React, { useState } from 'react';
import type { MdOrder, OrderCategory, OrderPriority } from '@/lib/smartFhirTypes';
import type { FhirServiceRequest } from '@/lib/smartFhirTypes';
import { mockOrderCatalog } from '@/lib/smartFhirMockData';
import Icon from '@/components/ui/AppIcon';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

interface OrderEntryModuleProps {
  patientId: string;
  encounterId: string;
  practitionerId: string;
  onOrderSigned: (orders: MdOrder[], serviceRequests: FhirServiceRequest[]) => void;
}

const CATEGORY_CONFIG: Record<OrderCategory, { label: string; icon: string; color: string }> = {
  lab: { label: 'Lab', icon: 'BeakerIcon', color: 'text-[#0043ce]' },
  medication: { label: 'Medication', icon: 'PlusCircleIcon', color: 'text-[#0e6027]' },
  referral: { label: 'Referral', icon: 'ArrowsRightLeftIcon', color: 'text-[#6929c4]' },
  procedure: { label: 'Procedure', icon: 'ClipboardDocumentListIcon', color: 'text-[#b45309]' },
  imaging: { label: 'Imaging', icon: 'PhotoIcon', color: 'text-carbon-gray-70' },
};

const PRIORITY_CONFIG: Record<OrderPriority, { label: string; color: string; bg: string }> = {
  routine: { label: 'Routine', color: 'text-carbon-gray-70', bg: 'bg-carbon-gray-10' },
  urgent: { label: 'Urgent', color: 'text-[#b45309]', bg: 'bg-[#fdf6dd]' },
  stat: { label: 'STAT', color: 'text-[#da1e28]', bg: 'bg-[#fff1f1]' },
};

function buildFhirServiceRequest(order: MdOrder, patientId: string, encounterId: string, practitionerId: string): FhirServiceRequest {
  return {
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    category: [{ coding: [{ system: 'http://snomed.info/sct', code: '386053000', display: order.category }], text: order.category }],
    code: { coding: [{ system: 'http://loinc.org', code: order.code, display: order.display }], text: order.display },
    // Persona-free (conventions §1.2): no hardcoded display name; the reference already carries the launch patient.
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
    requester: { reference: `Practitioner/${practitionerId}`, display: 'Dr. James Whitfield' },
    priority: order.priority,
    note: order.note ? [{ text: order.note }] : undefined,
    authoredOn: new Date().toISOString(),
  };
}

export default function OrderEntryModule({ patientId, encounterId, practitionerId, onOrderSigned }: OrderEntryModuleProps) {
  const [activeCategory, setActiveCategory] = useState<OrderCategory | 'all'>('all');
  const [orders, setOrders] = useState<MdOrder[]>([]);
  const [search, setSearch] = useState('');
  const [signStep, setSignStep] = useState<'entry' | 'review' | 'signing' | 'signed'>('entry');
  const [signedAt, setSignedAt] = useState('');
  const [confirmId, setConfirmId] = useState('');

  const filteredCatalog = mockOrderCatalog.filter((item) => {
    const matchCat = activeCategory === 'all' || item.category === activeCategory;
    const matchSearch = !search || item.display.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const addOrder = (code: string, display: string, category: OrderCategory) => {
    if (orders.find((o) => o.code === code)) return;
    const newOrder: MdOrder = {
      id: `ord-${Date.now()}-${code}`,
      category,
      code,
      display,
      priority: 'routine',
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    setOrders((prev) => [...prev, newOrder]);
  };

  const removeOrder = (id: string) => setOrders((prev) => prev.filter((o) => o.id !== id));

  const updatePriority = (id: string, priority: OrderPriority) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, priority } : o));
  };

  const updateNote = (id: string, note: string) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, note } : o));
  };

  const handleSign = () => {
    setSignStep('signing');
    const ts = new Date().toISOString();
    const cid = `SR-${Date.now().toString(36).toUpperCase()}`;
    const signedOrders = orders.map((o) => ({ ...o, status: 'signed' as const, signedAt: ts }));
    const serviceRequests = signedOrders.map((o) =>
      buildFhirServiceRequest(o, patientId, encounterId, practitionerId)
    );

    const writeToFhir = async () => {
      if (!getFhirMockMode()) {
        await Promise.allSettled(
          serviceRequests.map((sr) => getFhirClient().create(sr as any))
        );
      }
    };

    writeToFhir()
      .catch((err) => console.warn('[OrderEntryModule] FHIR ServiceRequest write failed:', err))
      .finally(() => {
        setSignedAt(ts);
        setConfirmId(cid);
        setSignStep('signed');
        onOrderSigned(signedOrders, serviceRequests);
      });
  };

  if (signStep === 'signing') {
    return (
      <div className="bg-white border border-carbon-gray-20 p-8 flex flex-col items-center justify-center min-h-[200px]">
        <div className="w-8 h-8 border-2 border-[#6929c4] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-carbon-gray-100">Signing orders and writing to FHIR…</p>
        <p className="text-xs text-carbon-gray-50 mt-1">Creating ServiceRequest resources in Cerner</p>
      </div>
    );
  }

  if (signStep === 'signed') {
    return (
      <div className="bg-white border border-[#a7f0ba]">
        <div className="bg-[#defbe6] px-5 py-4 flex items-center gap-3">
          <Icon name="CheckCircleIcon" size={20} className="text-[#0e6027]" />
          <div>
            <p className="text-sm font-semibold text-[#0e6027]">Orders signed and submitted to Cerner</p>
            <p className="text-xs text-[#0e6027]/70">FHIR ServiceRequest resources created · {new Date(signedAt).toLocaleTimeString()}</p>
          </div>
        </div>
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-carbon-gray-50">Confirmation ID: <span className="font-mono font-semibold text-carbon-gray-100">{confirmId}</span></p>
            <p className="text-xs text-carbon-gray-50">{orders.length} order{orders.length !== 1 ? 's' : ''} signed</p>
          </div>
          <div className="space-y-1.5">
            {orders.map((o) => {
              const catCfg = CATEGORY_CONFIG[o.category];
              const priCfg = PRIORITY_CONFIG[o.priority];
              return (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2 bg-carbon-gray-10 border border-carbon-gray-20">
                  <Icon name={catCfg.icon as any} size={14} className={catCfg.color} />
                  <span className="text-xs font-medium text-carbon-gray-100 flex-1">{o.display}</span>
                  <span className={`text-2xs font-semibold px-1.5 py-0.5 ${priCfg.bg} ${priCfg.color}`}>{priCfg.label}</span>
                  <Icon name="CheckCircleIcon" size={14} className="text-[#24a148]" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-carbon-gray-20">
      {/* Header */}
      <div className="px-5 py-3 border-b border-carbon-gray-20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="ClipboardDocumentCheckIcon" size={16} className="text-carbon-gray-70" />
          <span className="text-sm font-semibold text-carbon-gray-100">Order Entry</span>
          {orders.length > 0 && (
            <span className="bg-[#6929c4] text-white text-2xs font-bold px-1.5 py-0.5 min-w-[18px] text-center">
              {orders.length}
            </span>
          )}
        </div>
        {signStep === 'entry' && orders.length > 0 && (
          <button
            onClick={() => setSignStep('review')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#6929c4] text-white text-xs font-semibold hover:bg-[#491d8b] transition-colors"
          >
            <Icon name="PencilSquareIcon" size={13} />
            Review & Sign ({orders.length})
          </button>
        )}
        {signStep === 'review' && (
          <button
            onClick={() => setSignStep('entry')}
            className="text-xs text-carbon-gray-50 hover:text-carbon-gray-100"
          >
            ← Back to order entry
          </button>
        )}
      </div>

      {signStep === 'entry' && (
        <div className="flex divide-x divide-carbon-gray-20" style={{ minHeight: 320 }}>
          {/* Catalog */}
          <div className="flex-1 p-4">
            {/* Category filter */}
            <div className="flex gap-1 mb-3 flex-wrap">
              {(['all', 'lab', 'medication', 'referral', 'procedure', 'imaging'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-2xs font-semibold px-2 py-1 transition-colors ${
                    activeCategory === cat
                      ? 'bg-[#6929c4] text-white'
                      : 'bg-carbon-gray-10 text-carbon-gray-70 hover:bg-carbon-gray-20'
                  }`}
                >
                  {cat === 'all' ? 'All' : CATEGORY_CONFIG[cat].label}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative mb-3">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-carbon-gray-50" />
              <input
                type="text"
                placeholder="Search orders…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-carbon-gray-20 focus:outline-none focus:border-[#6929c4] bg-carbon-gray-10"
              />
            </div>
            {/* Order list */}
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {filteredCatalog.map((item) => {
                const catCfg = CATEGORY_CONFIG[item.category];
                const alreadyAdded = orders.some((o) => o.code === item.code);
                return (
                  <button
                    key={item.code}
                    onClick={() => addOrder(item.code, item.display, item.category)}
                    disabled={alreadyAdded}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border ${
                      alreadyAdded
                        ? 'bg-[#defbe6] border-[#a7f0ba] cursor-default'
                        : 'bg-white border-carbon-gray-20 hover:border-[#6929c4] hover:bg-[#f6f2ff]'
                    }`}
                  >
                    <Icon name={catCfg.icon as any} size={13} className={catCfg.color} />
                    <span className="text-xs text-carbon-gray-100 flex-1">{item.display}</span>
                    <span className="text-2xs text-carbon-gray-50">{catCfg.label}</span>
                    {alreadyAdded ? (
                      <Icon name="CheckIcon" size={13} className="text-[#24a148]" />
                    ) : (
                      <Icon name="PlusIcon" size={13} className="text-carbon-gray-30" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Order basket */}
          <div className="w-72 p-4 bg-carbon-gray-10 flex flex-col">
            <p className="text-2xs font-semibold text-carbon-gray-50 uppercase tracking-widest mb-3">Order Basket</p>
            {orders.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Icon name="ClipboardDocumentListIcon" size={28} className="text-carbon-gray-30 mb-2" />
                <p className="text-xs text-carbon-gray-50">Select orders from the catalog</p>
              </div>
            ) : (
              <div className="flex-1 space-y-2 overflow-y-auto">
                {orders.map((o) => {
                  const catCfg = CATEGORY_CONFIG[o.category];
                  return (
                    <div key={o.id} className="bg-white border border-carbon-gray-20 p-2.5">
                      <div className="flex items-start gap-2 mb-2">
                        <Icon name={catCfg.icon as any} size={13} className={`${catCfg.color} mt-0.5`} />
                        <p className="text-xs font-medium text-carbon-gray-100 flex-1 leading-snug">{o.display}</p>
                        <button onClick={() => removeOrder(o.id)} className="text-carbon-gray-30 hover:text-[#da1e28]">
                          <Icon name="XMarkIcon" size={13} />
                        </button>
                      </div>
                      {/* Priority selector */}
                      <div className="flex gap-1">
                        {(['routine', 'urgent', 'stat'] as OrderPriority[]).map((p) => {
                          const pc = PRIORITY_CONFIG[p];
                          return (
                            <button
                              key={p}
                              onClick={() => updatePriority(o.id, p)}
                              className={`text-2xs font-semibold px-1.5 py-0.5 transition-colors ${
                                o.priority === p ? `${pc.bg} ${pc.color} border border-current/30` : 'bg-carbon-gray-10 text-carbon-gray-50 hover:bg-carbon-gray-20'
                              }`}
                            >
                              {pc.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review & Sign step */}
      {signStep === 'review' && (
        <div className="p-5">
          <div className="bg-[#fdf6dd] border border-[#f1c21b] px-4 py-3 mb-4 flex items-start gap-2">
            <Icon name="ExclamationTriangleIcon" size={15} className="text-[#b45309] flex-shrink-0 mt-0.5" />
            <p className="text-xs text-[#b45309]">
              Review all orders before signing. Signed orders will be written to Cerner as FHIR ServiceRequest resources and cannot be undone from this app.
            </p>
          </div>
          <div className="space-y-2 mb-5">
            {orders.map((o) => {
              const catCfg = CATEGORY_CONFIG[o.category];
              const priCfg = PRIORITY_CONFIG[o.priority];
              return (
                <div key={o.id} className="flex items-center gap-3 px-4 py-3 bg-carbon-gray-10 border border-carbon-gray-20">
                  <Icon name={catCfg.icon as any} size={15} className={catCfg.color} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-carbon-gray-100">{o.display}</p>
                    <p className="text-2xs text-carbon-gray-50">{catCfg.label} · FHIR ServiceRequest</p>
                  </div>
                  <span className={`text-2xs font-bold px-2 py-0.5 ${priCfg.bg} ${priCfg.color}`}>{priCfg.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSign}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#6929c4] text-white text-sm font-semibold hover:bg-[#491d8b] transition-colors"
            >
              <Icon name="PencilSquareIcon" size={15} />
              Sign {orders.length} Order{orders.length !== 1 ? 's' : ''}
            </button>
            <button
              onClick={() => setSignStep('entry')}
              className="px-4 py-2.5 border border-carbon-gray-20 text-sm text-carbon-gray-70 hover:bg-carbon-gray-10 transition-colors"
            >
              Edit Orders
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
