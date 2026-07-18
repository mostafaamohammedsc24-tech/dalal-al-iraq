import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation, Link } from "wouter";
import { Send, ArrowRight, MessageCircle, ShieldCheck, BadgeCheck, Phone, Sparkles, ImagePlus, Mic, Square, Loader2 } from "lucide-react";
import { api, getUser, mediaUrl, uploadFile } from "@/lib/api";
import { timeAgo, formatPrice, dealTypeStyle, LOGO_URL } from "@/lib/utils";
import { AiAssistant } from "@/components/ai-assistant";

const DALAL_NAME = "شبكة دلال العراق";
const LISTING_CARD_RE = /^\[\[listing:([^\]]+)\]\]\n?/;
const URL_RE = /(https?:\/\/[^\s]+)/g;

interface Chat {
  id: string;
  listing: { id: string | null; title: string };
  sender: { id: string; name: string; phone: string };
  receiver: { id: string; name: string; phone: string };
  messages: Array<{ text: string; type?: string; createdAt: string }>;
}

interface Message {
  id: string;
  text: string;
  type?: string;
  mediaUrl?: string | null;
  userId: string;
  createdAt: string;
  user: { id: string; name: string };
}

// Render message text with clickable links.
function LinkifiedText({ text, isMe }: { text: string; isMe: boolean }) {
  const parts = text.split(URL_RE);
  return (
    <p className="px-1 whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            className={`underline ${isMe ? "text-white" : "text-orange-600 dark:text-orange-400"}`}>
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

interface CardListing {
  id: string;
  title: string;
  price: number;
  images: string[];
  city: string;
  dealType: string | null;
}

function InlineListingCard({ id }: { id: string }) {
  const [item, setItem] = useState<CardListing | null>(null);
  useEffect(() => {
    api.get<CardListing>(`/listings/${id}`).then(setItem).catch(() => setItem(null));
  }, [id]);
  if (!item) return null;
  const img = item.images?.[0];
  return (
    <Link href={`/listings/${item.id}`}
      className="flex gap-2.5 bg-gray-50 dark:bg-gray-800 rounded-xl p-2 mb-2 border border-gray-100 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-800 transition">
      <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 flex-shrink-0">
        {img ? <img src={mediaUrl(img)} alt={item.title} className="w-full h-full object-cover" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-gray-800 dark:text-gray-100 text-xs line-clamp-1">{item.title}</p>
        <p className="text-orange-500 font-bold text-sm">{formatPrice(item.price)}</p>
        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5 ${dealTypeStyle(item.dealType)}`}>
          {item.dealType || "للبيع"}
        </span>
      </div>
    </Link>
  );
}

export default function ChatPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const chatId = searchParams.get("id");
  const aiMode = searchParams.get("ai") === "1";
  const officeParam = searchParams.get("office");

  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [attachError, setAttachError] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const currentUser = getUser();
  const isAdminMe = currentUser?.role === "admin";

  function loadChats() {
    return api.get<Chat[]>("/chats")
      .then(setChats)
      .catch(() => setChats([]));
  }

  useEffect(() => {
    if (!currentUser) { navigate("/login"); return; }
    // Office QR deep link: open (or create) the office-attributed chat, then land on it.
    if (officeParam) {
      api.post<{ id: string }>("/chats", { officeId: officeParam })
        .then((c) => navigate(`/chat?id=${c.id}`))
        .catch(() => navigate("/chat"))
        .finally(() => setLoading(false));
      return;
    }
    // Ensure every user has an open consultation chat with Dalal Iraq.
    const ensure = isAdminMe ? Promise.resolve() : api.post("/chats", {}).catch(() => {});
    Promise.resolve(ensure)
      .then(loadChats)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function counterpart(chat: Chat) {
    return currentUser?.userId === chat.sender.id ? chat.receiver : chat.sender;
  }

  function chatLabel(chat: Chat) {
    return isAdminMe ? counterpart(chat).name : DALAL_NAME;
  }

  useEffect(() => {
    if (!chatId) return;
    api.get<Message[]>(`/chats/${chatId}/messages`)
      .then((msgs) => {
        setMessages(msgs);
        setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: "smooth" }), 100);
      })
      .catch(() => setMessages([]));
  }, [chatId]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !chatId) return;
    setSending(true);
    try {
      const msg = await api.post<Message>(`/chats/${chatId}/messages`, { text });
      setMessages((prev) => [...prev, msg]);
      setText("");
      setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } finally {
      setSending(false);
    }
  }

  async function sendMedia(type: "image" | "voice", file: File | Blob, name?: string) {
    if (!chatId) return;
    setAttachError("");
    setUploading(true);
    try {
      const asFile = file instanceof File ? file : new File([file], name || "voice.webm", { type: file.type });
      const path = await uploadFile(asFile);
      const msg = await api.post<Message>(`/chats/${chatId}/messages`, { type, mediaUrl: path });
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => messagesEnd.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "تعذر إرسال الملف");
    } finally {
      setUploading(false);
    }
  }

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setAttachError("الرجاء اختيار صورة"); return; }
    if (file.size > 15 * 1024 * 1024) { setAttachError("حجم الصورة كبير جداً (الحد 15 ميغابايت)"); return; }
    await sendMedia("image", file);
  }

  async function toggleRecording() {
    setAttachError("");
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setAttachError("التسجيل الصوتي غير مدعوم في هذا المتصفح");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 0) void sendMedia("voice", blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setAttachError("تعذّر الوصول إلى الميكروفون");
    }
  }

  const activeChat = chatId ? chats.find((c) => c.id === chatId) : null;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full" />
    </div>
  );

  if (aiMode) {
    return (
      <div className="max-w-lg mx-auto flex flex-col" style={{ height: "calc(100vh - 8rem)" }}>
        <div className="bg-white dark:bg-gray-900 px-4 pt-3 flex items-center gap-2 flex-shrink-0">
          <button onClick={() => navigate("/chat")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
            <ArrowRight className="w-5 h-5" />
          </button>
          <span className="text-sm font-medium text-gray-500">المساعد الذكي</span>
        </div>
        <AiAssistant />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto flex flex-col" style={{ height: "calc(100vh - 8rem)" }}>
      {chatId && activeChat ? (
        <>
          {/* Header */}
          <div className="bg-white dark:bg-gray-900 px-4 py-3 flex items-center gap-3 shadow-sm border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
            <button onClick={() => navigate("/chat")} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
              <ArrowRight className="w-5 h-5" />
            </button>
            {!isAdminMe ? (
              <img src={LOGO_URL} alt={DALAL_NAME} className="w-9 h-9 rounded-lg object-cover" />
            ) : (
              <div className="w-9 h-9 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm">
                {chatLabel(activeChat).charAt(0)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1">
                {chatLabel(activeChat)}
                {!isAdminMe && <BadgeCheck className="w-4 h-4 text-orange-500" />}
              </p>
              <p className="text-xs text-gray-400 line-clamp-1">{activeChat.listing.title}</p>
            </div>
            {isAdminMe && counterpart(activeChat).phone && (
              <a href={`tel:${counterpart(activeChat).phone}`}
                className="flex items-center gap-1.5 bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-xl text-xs font-bold hover:bg-green-100 dark:hover:bg-green-900 transition flex-shrink-0">
                <Phone className="w-3.5 h-3.5" />
                {counterpart(activeChat).phone}
              </a>
            )}
          </div>

          {/* Free consultation banner */}
          {!isAdminMe && (
            <div className="bg-emerald-50 dark:bg-emerald-950 border-b border-emerald-100 dark:border-emerald-900 px-4 py-2 flex items-center gap-2 flex-shrink-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-700 dark:text-emerald-300 text-xs font-medium">الاستشارة مجانية — نحن وسيطك الموثوق في كل خطوة.</p>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50 dark:bg-gray-950">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 py-10">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">ابدأ المحادثة!</p>
              </div>
            ) : messages.map((msg) => {
              const isMe = msg.userId === currentUser?.userId;
              const cardMatch = msg.text.match(LISTING_CARD_RE);
              const cardId = cardMatch?.[1];
              const body = cardId ? msg.text.replace(LISTING_CARD_RE, "") : msg.text;
              return (
                <div key={msg.id} className={`flex ${isMe ? "justify-start" : "justify-end"}`}>
                  <div className={`max-w-[78%] px-3 py-2.5 rounded-2xl text-sm ${
                    isMe
                      ? "bg-orange-500 text-white rounded-tr-sm"
                      : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm rounded-tl-sm border border-gray-100 dark:border-gray-700"
                  }`}>
                    {cardId && <InlineListingCard id={cardId} />}
                    {msg.type === "image" && msg.mediaUrl && (
                      <a href={mediaUrl(msg.mediaUrl)} target="_blank" rel="noopener noreferrer">
                        <img src={mediaUrl(msg.mediaUrl)} alt="صورة" className="rounded-xl max-w-full max-h-64 object-cover mb-1" />
                      </a>
                    )}
                    {msg.type === "voice" && msg.mediaUrl && (
                      <audio controls src={mediaUrl(msg.mediaUrl)} className="max-w-full mb-1" />
                    )}
                    {body && <LinkifiedText text={body} isMe={isMe} />}
                    <p className={`text-xs mt-1 px-1 ${isMe ? "text-orange-200" : "text-gray-400"}`}>{timeAgo(msg.createdAt)}</p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEnd} />
          </div>

          {/* Input */}
          {attachError && <p className="text-red-500 text-xs px-4 pt-2 bg-white dark:bg-gray-900 flex-shrink-0">{attachError}</p>}
          <form onSubmit={send} className="bg-white dark:bg-gray-900 px-4 py-3 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
            <label className={`p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-orange-500 hover:border-orange-300 transition cursor-pointer ${uploading ? "opacity-40 pointer-events-none" : ""}`}
              title="إرسال صورة">
              <ImagePlus className="w-5 h-5" />
              <input type="file" accept="image/*" className="hidden" onChange={onPickImage} disabled={uploading} />
            </label>
            <button type="button" onClick={toggleRecording} disabled={uploading}
              className={`p-2.5 rounded-xl border transition disabled:opacity-40 ${
                recording ? "border-red-400 bg-red-50 dark:bg-red-950 text-red-500 animate-pulse" : "border-gray-200 dark:border-gray-700 text-gray-500 hover:text-orange-500 hover:border-orange-300"
              }`}
              title={recording ? "إيقاف التسجيل وإرسال" : "رسالة صوتية"}>
              {recording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <input value={text} onChange={(e) => setText(e.target.value)}
              placeholder={recording ? "جارٍ التسجيل..." : "اكتب رسالتك..."} disabled={recording}
              className="flex-1 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl px-4 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-orange-300 disabled:opacity-60" />
            <button type="submit" disabled={sending || uploading || !text.trim()}
              className="bg-orange-500 text-white p-2.5 rounded-xl hover:bg-orange-600 transition disabled:opacity-40">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </form>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">المحادثات</h2>
          {!isAdminMe && (
            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-100 dark:border-emerald-900 rounded-xl px-3 py-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              <p className="text-emerald-700 dark:text-emerald-300 text-xs font-medium">كل تواصلك يكون مع شبكة دلال العراق — والاستشارة مجانية تماماً.</p>
            </div>
          )}

          {/* AI assistant is a separate conversation with its own history. */}
          <button onClick={() => navigate("/chat?ai=1")}
            className="w-full bg-gradient-to-br from-purple-50 to-orange-50 dark:from-purple-950/40 dark:to-orange-950/40 rounded-2xl p-4 shadow-sm border border-purple-100 dark:border-purple-900 hover:border-purple-300 dark:hover:border-purple-700 transition text-right flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-orange-500 rounded-xl flex items-center justify-center text-white flex-shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">المساعد الذكي</p>
              <p className="text-gray-500 dark:text-gray-400 text-xs line-clamp-1">اسأل عن العقارات والسيارات وسأبحث لك فوراً</p>
            </div>
          </button>

          {chats.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <MessageCircle className="w-14 h-14 mx-auto mb-4 opacity-20" />
              <p>لا توجد محادثات بعد</p>
              <p className="text-sm mt-1 text-gray-300 dark:text-gray-600">ابدأ محادثة من صفحة أي إعلان</p>
            </div>
          ) : (
            <div className="space-y-3">
              {chats.map((chat) => {
                const label = chatLabel(chat);
                const lastMsg = chat.messages?.[0];
                const preview =
                  lastMsg?.type === "image" ? "📷 صورة"
                    : lastMsg?.type === "voice" ? "🎤 رسالة صوتية"
                      : lastMsg?.text.replace(LISTING_CARD_RE, "").split("\n")[0];
                const phone = isAdminMe ? counterpart(chat).phone : "";
                return (
                  <button key={chat.id} onClick={() => navigate(`/chat?id=${chat.id}`)}
                    className="w-full bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-800 hover:border-orange-200 dark:hover:border-orange-800 transition text-right flex items-center gap-3">
                    {!isAdminMe ? (
                      <img src={LOGO_URL} alt={DALAL_NAME} className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold flex-shrink-0">
                        {label.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 dark:text-gray-100 text-sm flex items-center gap-1">
                        {label}
                        {!isAdminMe && <BadgeCheck className="w-3.5 h-3.5 text-orange-500" />}
                      </p>
                      {phone && (
                        <p className="text-green-600 dark:text-green-400 text-xs flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3" />{phone}
                        </p>
                      )}
                      <p className="text-gray-400 text-xs line-clamp-1">{chat.listing.title}</p>
                      {preview && <p className="text-gray-300 dark:text-gray-600 text-xs line-clamp-1 mt-0.5">{preview}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
