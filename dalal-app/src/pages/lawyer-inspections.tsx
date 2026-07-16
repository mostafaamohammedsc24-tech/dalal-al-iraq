import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ClipboardCheck, X, Upload } from "lucide-react";
import { api, getUser, uploadFile, mediaUrl } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface InspectionRequest {
  id: string; propertyId?: string | null; requestedByType: string; requestedById: string;
  lawyerId?: string | null; tier: string; status: string; rejectionReason?: string | null; createdAt: string;
}
interface Report {
  id: string; requestId: string; aurScreenshotUrl?: string | null; aurNotes?: string | null;
  ownershipChainText?: string | null; ownershipDocs: string[]; liensText?: string | null; liensProofs: string[];
  financialDuesReceipts: string[]; easementsText?: string | null; easementsImages: string[];
  finalVerdict?: string | null; responsibilityAccepted: boolean; isDraft: boolean;
}

const TIER_AR: Record<string, string> = { silver: "فضية", gold: "ذهبية", diamond: "ماسية" };
const STATUS_AR: Record<string, string> = { new: "جديد", accepted: "مقبول", in_progress: "قيد العمل", closed: "مكتمل", rejected: "مرفوض" };

const emptyReport = {
  aurScreenshotUrl: "", aurNotes: "", ownershipChainText: "", ownershipDocs: [] as string[],
  liensText: "", liensProofs: [] as string[], financialDuesReceipts: [] as string[],
  easementsText: "", easementsImages: [] as string[], finalVerdict: "", responsibilityAccepted: false,
};

export default function LawyerInspectionsPage() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [requests, setRequests] = useState<InspectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<InspectionRequest | null>(null);
  const [report, setReport] = useState(emptyReport);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "lawyer") { navigate("/lawyer/login"); return; }
    setReady(true);
    load();
  }, [navigate]);

  async function load() {
    setLoading(true);
    try {
      const d = await api.get<{ requests: InspectionRequest[] }>("/inspections/requests");
      setRequests(d.requests);
    } finally {
      setLoading(false);
    }
  }

  async function accept(id: string) {
    await api.patch(`/inspections/requests/${id}/accept`, {});
    load();
  }

  async function reject(id: string) {
    const reason = prompt("سبب الرفض (اختياري):") || "";
    await api.patch(`/inspections/requests/${id}/reject`, { reason });
    load();
  }

  async function openReport(req: InspectionRequest) {
    setActive(req);
    const d = await api.get<{ report: Report | null }>(`/inspections/reports/${req.id}`);
    if (d.report) {
      setReport({
        aurScreenshotUrl: d.report.aurScreenshotUrl || "", aurNotes: d.report.aurNotes || "",
        ownershipChainText: d.report.ownershipChainText || "", ownershipDocs: d.report.ownershipDocs || [],
        liensText: d.report.liensText || "", liensProofs: d.report.liensProofs || [],
        financialDuesReceipts: d.report.financialDuesReceipts || [], easementsText: d.report.easementsText || "",
        easementsImages: d.report.easementsImages || [], finalVerdict: d.report.finalVerdict || "",
        responsibilityAccepted: d.report.responsibilityAccepted,
      });
    } else {
      setReport(emptyReport);
    }
  }

  async function uploadToField(field: "aurScreenshotUrl", file: File): Promise<void>;
  async function uploadToField(field: "ownershipDocs" | "liensProofs" | "financialDuesReceipts" | "easementsImages", file: File): Promise<void>;
  async function uploadToField(field: string, file: File) {
    setUploadingField(field);
    try {
      const path = await uploadFile(file);
      setReport((r) => {
        if (field === "aurScreenshotUrl") return { ...r, aurScreenshotUrl: path };
        const arr = (r as unknown as Record<string, string[]>)[field] || [];
        return { ...r, [field]: [...arr, path] };
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر رفع الملف");
    } finally {
      setUploadingField(null);
    }
  }

  async function saveReport(isDraft: boolean) {
    if (!active) return;
    if (!isDraft && !report.responsibilityAccepted) {
      alert("يجب الموافقة على تحمل المسؤولية القانونية قبل الإرسال النهائي");
      return;
    }
    if (!isDraft && !report.finalVerdict) {
      alert("يجب اختيار التوصية النهائية");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/inspections/reports/${active.id}`, { ...report, isDraft });
      alert(isDraft ? "تم حفظ المسودة" : "تم إرسال التقرير النهائي");
      setActive(null);
      load();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "تعذر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-orange-500" /> طلبات الفحص القانوني
      </h1>

      {loading ? (
        <div className="text-center text-gray-400 py-16">جاري التحميل...</div>
      ) : requests.length === 0 ? (
        <div className="text-center text-gray-400 py-16">لا توجد طلبات فحص حالياً</div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">درجة {TIER_AR[r.tier]} · {STATUS_AR[r.status]}</p>
                <p className="text-xs text-gray-400 mt-0.5">{r.requestedByType === "office" ? "مكتب" : "مستخدم"} · {timeAgo(r.createdAt)}</p>
              </div>
              <div className="flex gap-2">
                {r.status === "new" && (
                  <>
                    <button onClick={() => accept(r.id)} className="text-xs bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-lg font-medium">قبول</button>
                    <button onClick={() => reject(r.id)} className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg font-medium">رفض</button>
                  </>
                )}
                {(r.status === "accepted" || r.status === "in_progress") && (
                  <button onClick={() => openReport(r)} className="text-xs bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-medium">تعبئة التقرير</button>
                )}
                {r.status === "closed" && (
                  <button onClick={() => navigate(`/inspection-report/${r.id}`)} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">عرض التقرير</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {active && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-lg my-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 dark:text-gray-100">تقرير الفحص القانوني</h2>
              <button onClick={() => setActive(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-4 text-sm">
              <FieldGroup label="لقطة شاشة الاستفسار العقاري (AUR)">
                {report.aurScreenshotUrl && <img src={mediaUrl(report.aurScreenshotUrl)} className="w-full rounded-lg mb-2" />}
                <UploadButton uploading={uploadingField === "aurScreenshotUrl"} onFile={(f) => uploadToField("aurScreenshotUrl", f)} />
                <textarea value={report.aurNotes} onChange={(e) => setReport({ ...report, aurNotes: e.target.value })} placeholder="ملاحظات الاستفسار العقاري" rows={2} className="w-full mt-2 border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm" />
              </FieldGroup>

              <FieldGroup label="سلسلة الملكية">
                <textarea value={report.ownershipChainText} onChange={(e) => setReport({ ...report, ownershipChainText: e.target.value })} placeholder="وصف سلسلة انتقال الملكية" rows={2} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm" />
                <FileList files={report.ownershipDocs} onRemove={(i) => setReport({ ...report, ownershipDocs: report.ownershipDocs.filter((_, idx) => idx !== i) })} />
                <UploadButton uploading={uploadingField === "ownershipDocs"} onFile={(f) => uploadToField("ownershipDocs", f)} />
              </FieldGroup>

              <FieldGroup label="الرهون والحجوزات">
                <textarea value={report.liensText} onChange={(e) => setReport({ ...report, liensText: e.target.value })} placeholder="تفاصيل أي رهون أو حجوزات" rows={2} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm" />
                <FileList files={report.liensProofs} onRemove={(i) => setReport({ ...report, liensProofs: report.liensProofs.filter((_, idx) => idx !== i) })} />
                <UploadButton uploading={uploadingField === "liensProofs"} onFile={(f) => uploadToField("liensProofs", f)} />
              </FieldGroup>

              <FieldGroup label="إيصالات المستحقات المالية (بلدية، ماء، كهرباء)">
                <FileList files={report.financialDuesReceipts} onRemove={(i) => setReport({ ...report, financialDuesReceipts: report.financialDuesReceipts.filter((_, idx) => idx !== i) })} />
                <UploadButton uploading={uploadingField === "financialDuesReceipts"} onFile={(f) => uploadToField("financialDuesReceipts", f)} />
              </FieldGroup>

              <FieldGroup label="الارتفاقات والحقوق العينية">
                <textarea value={report.easementsText} onChange={(e) => setReport({ ...report, easementsText: e.target.value })} placeholder="تفاصيل حقوق الارتفاق" rows={2} className="w-full border border-gray-200 dark:border-gray-700 dark:bg-gray-800 rounded-xl px-3 py-2 text-sm" />
                <FileList files={report.easementsImages} onRemove={(i) => setReport({ ...report, easementsImages: report.easementsImages.filter((_, idx) => idx !== i) })} />
                <UploadButton uploading={uploadingField === "easementsImages"} onFile={(f) => uploadToField("easementsImages", f)} />
              </FieldGroup>

              <FieldGroup label="التوصية النهائية">
                <div className="flex gap-2">
                  {[{ id: "clear", label: "سليم - يمكن المتابعة" }, { id: "caution", label: "بحاجة لحذر" }, { id: "risky", label: "غير موصى به" }].map((v) => (
                    <button key={v.id} onClick={() => setReport({ ...report, finalVerdict: v.id })} className={`flex-1 text-xs py-2 rounded-lg font-medium transition ${report.finalVerdict === v.id ? "bg-orange-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                      {v.label}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <label className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl text-xs text-amber-700 dark:text-amber-400">
                <input type="checkbox" checked={report.responsibilityAccepted} onChange={(e) => setReport({ ...report, responsibilityAccepted: e.target.checked })} className="mt-0.5" />
                أؤكد أنني قمت بفحص هذا العقار بدقة مهنية وأتحمل المسؤولية القانونية الكاملة عن دقة هذا التقرير.
              </label>

              <div className="flex gap-2">
                <button onClick={() => saveReport(true)} disabled={saving} className="flex-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 py-3 rounded-xl font-bold text-sm disabled:opacity-50">حفظ كمسودة</button>
                <button onClick={() => saveReport(false)} disabled={saving} className="flex-1 bg-orange-500 text-white py-3 rounded-xl font-bold text-sm hover:bg-orange-600 transition disabled:opacity-50">إرسال التقرير النهائي</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-gray-600 dark:text-gray-300 mb-1.5">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function UploadButton({ uploading, onFile }: { uploading: boolean; onFile: (f: File) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-200 transition">
      <Upload className="w-3.5 h-3.5" /> {uploading ? "جاري الرفع..." : "رفع ملف"}
      <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    </label>
  );
}

function FileList({ files, onRemove }: { files: string[]; onRemove: (i: number) => void }) {
  if (!files.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <div key={i} className="relative">
          <img src={mediaUrl(f)} className="w-14 h-14 rounded-lg object-cover border border-gray-200 dark:border-gray-700" />
          <button type="button" onClick={() => onRemove(i)} className="absolute -top-1.5 -right-1.5 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">×</button>
        </div>
      ))}
    </div>
  );
}
