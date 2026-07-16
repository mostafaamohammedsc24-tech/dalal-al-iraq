export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">سياسة الخصوصية</h1>
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5 text-gray-600 leading-relaxed text-sm">
        {[
          { title: "١. مقدمة", body: "تلتزم شبكة دلال العراق بحماية خصوصية مستخدميها. توضح هذه السياسة كيفية جمع معلوماتك واستخدامها وحمايتها." },
          { title: "٢. المعلومات التي نجمعها", body: "نجمع رقم الهاتف والاسم الكامل وبيانات الإعلانات التي تنشرها وبيانات الاستخدام." },
          { title: "٣. كيف نستخدم معلوماتك", body: "نستخدم معلوماتك لتشغيل الخدمة وتحسينها، والتواصل بشأن إعلاناتك، ومنع الاحتيال وضمان أمان المنصة." },
          { title: "٤. حماية البيانات", body: "نستخدم تشفيراً متقدماً لحماية بياناتك. لا نبيع أو نشارك معلوماتك مع أطراف ثالثة إلا بموافقتك أو بموجب القانون." },
          { title: "٥. حقوقك", body: "لك الحق في الوصول إلى بياناتك وتصحيحها وحذف حسابك وبياناتك في أي وقت." },
        ].map(({ title, body }) => (
          <section key={title}>
            <h2 className="text-base font-bold text-gray-800 mb-2">{title}</h2>
            <p>{body}</p>
          </section>
        ))}
        <section>
          <h2 className="text-base font-bold text-gray-800 mb-2">٦. التواصل معنا</h2>
          <p>للاستفسارات حول سياسة الخصوصية:</p>
          <a href="https://wa.me/9647740080310" target="_blank" rel="noreferrer"
            className="text-orange-500 hover:underline mt-1 inline-block">
            واتساب: ‪+9647740080310‬
          </a>
        </section>
        <p className="text-gray-400 text-xs border-t border-gray-100 pt-4">آخر تحديث: يونيو 2024</p>
      </div>
    </div>
  );
}
