import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

interface AiMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
}

const SUGGESTIONS = [
  "أبحث عن بيت للبيع في بغداد بأقل من 200 مليون",
  "شقة للايجار في البصرة غرفتين نوم",
  "أرض في النجف مساحة أكبر من 300 متر",
];

export function AiAssistant() {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  function scrollDown() {
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  }

  useEffect(() => {
    api.get<{ messages: AiMessage[] }>("/ai/messages")
      .then((d) => { setMessages(d.messages); scrollDown(); })
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, []);

  async function send(content: string) {
    const text = content.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    // Optimistic user bubble.
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempId, role: "user", content: text, createdAt: new Date().toISOString() }]);
    scrollDown();
    try {
      const res = await api.post<{ userMessage: AiMessage; assistantMessage: AiMessage }>(
        "/ai/messages",
        { content: text },
      );
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        res.userMessage,
        res.assistantMessage,
      ]);
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        { id: tempId, role: "user", content: text, createdAt: new Date().toISOString() },
        { id: `err-${Date.now()}`, role: "assistant", content: "تعذّر الاتصال بالمساعد. حاول مرة أخرى.", createdAt: new Date().toISOString() },
      ]);
    } finally {
      setSending(false);
      scrollDown();
    }
  }

  async function clearHistory() {
    try {
      await api.delete("/ai/messages");
      setMessages([]);
    } catch { /* ignore */ }
  }

  if (loading) return (
    <div className="flex items-center justify-center flex-1">
      <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  return (
    <>
      <div className="bg-white dark:bg-gray-900 px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
        <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-orange-500 rounded-xl flex items-center justify-center text-white flex-shrink-0">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-800 dark:text-gray-100">المساعد الذكي</p>
          <p className="text-xs text-gray-400 line-clamp-1">يبحث لك في إعلانات شبكة دلال العراق</p>
        </div>
        {messages.length > 0 && (
          <button onClick={clearHistory} title="مسح المحادثة"
            className="text-gray-400 hover:text-red-500 transition flex-shrink-0">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 dark:bg-gray-950">
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm mb-4">اسألني عن أي عقار أو سيارة وسأبحث لك في قاعدة بيانات دلال العراق</p>
            <div className="space-y-2 max-w-xs mx-auto">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)}
                  className="w-full text-right text-xs bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl px-3 py-2 hover:border-orange-300 transition text-gray-600 dark:text-gray-300">
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : messages.map((msg) => {
          const isMe = msg.role === "user";
          return (
            <div key={msg.id} className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] px-3 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                isMe
                  ? "bg-orange-500 text-white rounded-tr-sm"
                  : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm rounded-tl-sm border border-gray-100 dark:border-gray-700"
              }`}>
                {msg.content}
                <p className={`text-xs mt-1 ${isMe ? "text-orange-200" : "text-gray-400"}`}>{timeAgo(msg.createdAt)}</p>
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-end">
            <div className="bg-white dark:bg-gray-800 shadow-sm rounded-2xl rounded-tl-sm border border-gray-100 dark:border-gray-700 px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="bg-white dark:bg-gray-900 px-4 py-3 flex gap-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={sending}
          placeholder="اكتب طلبك... مثال: بيت للبيع في الكرادة"
          className="flex-1 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60" />
        <button type="submit" disabled={sending || !input.trim()}
          className="bg-gradient-to-br from-purple-500 to-orange-500 text-white p-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-40">
          <Send className="w-5 h-5" />
        </button>
      </form>
    </>
  );
}
