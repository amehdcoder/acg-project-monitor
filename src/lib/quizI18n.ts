// Localized strings for the quiz "already completed" experience.
// Self-contained so it can grow without touching the large global i18n type.
import { Language } from "@/lib/i18n";

export type QuizStringKey =
  | "completedTitle"
  | "completedDesc"
  | "nextInfo"
  | "history"
  | "preLabel"
  | "postLabel"
  | "notTakenYet"
  | "scoreLabel"
  | "back"
  | "onlyOnce";

type QuizStrings = Record<QuizStringKey, string>;

const en: QuizStrings = {
  completedTitle: "{label} Already Completed",
  completedDesc:
    "You have already submitted your {label} for “{title}”. Each participant may take the {label} only once.",
  nextInfo:
    "Your {label} result is safely recorded. The {other} will appear here automatically the moment an administrator opens it.",
  history: "Your attempt history",
  preLabel: "Pre-test",
  postLabel: "Post-test",
  notTakenYet: "Not taken yet",
  scoreLabel: "Score",
  back: "Return to Quizzes",
  onlyOnce: "This test can only be taken once.",
};

const STRINGS: Record<Language, QuizStrings> = {
  en,
  ha: {
    completedTitle: "An Riga An Kammala {label}",
    completedDesc:
      "Ka riga ka gabatar da {label} naka don “{title}”. Kowane mai halarta zai iya yin {label} sau ɗaya kawai.",
    nextInfo:
      "An adana sakamakon {label} naka lafiya. {other} zai bayyana anan kai tsaye da zaran mai gudanarwa ya buɗe shi.",
    history: "Tarihin yunƙurinka",
    preLabel: "Gwajin Farko",
    postLabel: "Gwajin Ƙarshe",
    notTakenYet: "Ba a yi ba tukuna",
    scoreLabel: "Maki",
    back: "Koma zuwa Jarabawa",
    onlyOnce: "Ana iya yin wannan gwajin sau ɗaya kawai.",
  },
  yo: {
    completedTitle: "{label} Ti Parí Tẹ́lẹ̀",
    completedDesc:
      "O ti fi {label} rẹ sílẹ̀ fún “{title}” tẹ́lẹ̀. Olùkópa kọ̀ọ̀kan lè ṣe {label} ẹ̀ẹ̀kan ṣoṣo.",
    nextInfo:
      "A ti fi àbájáde {label} rẹ pamọ́ dáadáa. {other} yóò farahàn níbí lẹ́sẹ̀kẹsẹ̀ tí alábòójútó bá ṣí i.",
    history: "Ìtàn ìgbìyànjú rẹ",
    preLabel: "Ìdánwò Àkọ́kọ́",
    postLabel: "Ìdánwò Ìkẹyìn",
    notTakenYet: "Kò tíì ṣe",
    scoreLabel: "Àmì",
    back: "Padà sí Àwọn Ìdánwò",
    onlyOnce: "Ìdánwò yìí lè ṣe ẹ̀ẹ̀kan ṣoṣo.",
  },
  ig: {
    completedTitle: "Emechaala {label}",
    completedDesc:
      "Ị nyefeela {label} gị maka “{title}”. Onye ọ bụla nwere ike ime {label} naanị otu ugboro.",
    nextInfo:
      "Echekwara nsonaazụ {label} gị nke ọma. {other} ga-apụta ebe a ozugbo onye nchịkwa meghere ya.",
    history: "Akụkọ mgbalị gị",
    preLabel: "Ule Mbụ",
    postLabel: "Ule Ikpeazụ",
    notTakenYet: "Emebeghị ya",
    scoreLabel: "Akara",
    back: "Laghachi na Ule",
    onlyOnce: "Enwere ike ime ule a naanị otu ugboro.",
  },
  id: {
    completedTitle: "{label} Amaachoro Nu",
    completedDesc:
      "Ihi nafu {label} kpo nu “{title}”. Onobubẹ ka lehi {label} nyeje nyeje.",
    nextInfo:
      "Ihi njeenyi {label} kpo nu. {other} ga waadaa eba nyilebo owoicho onu ka le ehi.",
    history: "Ochi ihi kpo nu",
    preLabel: "Ihi Onyeje",
    postLabel: "Ihi Enehi",
    notTakenYet: "Alehi ce nu",
    scoreLabel: "Ipu",
    back: "Duu eba Ihi",
    onlyOnce: "Ihi nyaa le ha nyeje nyeje.",
  },
  ar: {
    completedTitle: "تم إكمال {label} بالفعل",
    completedDesc:
      "لقد قمت بالفعل بتقديم {label} الخاص بك لـ «{title}». يمكن لكل مشارك أداء {label} مرة واحدة فقط.",
    nextInfo:
      "تم حفظ نتيجة {label} الخاصة بك بأمان. سيظهر {other} هنا تلقائيًا بمجرد أن يفتحه المسؤول.",
    history: "سجل محاولاتك",
    preLabel: "الاختبار القبلي",
    postLabel: "الاختبار البعدي",
    notTakenYet: "لم يتم أداؤه بعد",
    scoreLabel: "النتيجة",
    back: "العودة إلى الاختبارات",
    onlyOnce: "يمكن أداء هذا الاختبار مرة واحدة فقط.",
  },
  he: {
    completedTitle: "{label} כבר הושלם",
    completedDesc:
      "כבר הגשת את ה{label} שלך עבור „{title}”. כל משתתף רשאי לבצע את ה{label} פעם אחת בלבד.",
    nextInfo:
      "תוצאת ה{label} שלך נשמרה בבטחה. ה{other} יופיע כאן אוטומטית ברגע שמנהל יפתח אותו.",
    history: "היסטוריית הניסיונות שלך",
    preLabel: "מבחן מקדים",
    postLabel: "מבחן מסכם",
    notTakenYet: "טרם בוצע",
    scoreLabel: "ציון",
    back: "חזרה למבחנים",
    onlyOnce: "ניתן לבצע מבחן זה פעם אחת בלבד.",
  },
  fr: {
    completedTitle: "{label} déjà terminé",
    completedDesc:
      "Vous avez déjà soumis votre {label} pour « {title} ». Chaque participant ne peut passer le {label} qu’une seule fois.",
    nextInfo:
      "Votre résultat du {label} est enregistré en toute sécurité. Le {other} apparaîtra ici automatiquement dès qu’un administrateur l’ouvrira.",
    history: "Historique de vos tentatives",
    preLabel: "Pré-test",
    postLabel: "Post-test",
    notTakenYet: "Pas encore passé",
    scoreLabel: "Score",
    back: "Retour aux quiz",
    onlyOnce: "Ce test ne peut être passé qu’une seule fois.",
  },
  es: {
    completedTitle: "{label} ya completado",
    completedDesc:
      "Ya has enviado tu {label} para «{title}». Cada participante puede realizar el {label} una sola vez.",
    nextInfo:
      "Tu resultado del {label} está guardado de forma segura. El {other} aparecerá aquí automáticamente en cuanto un administrador lo abra.",
    history: "Historial de tus intentos",
    preLabel: "Prueba previa",
    postLabel: "Prueba posterior",
    notTakenYet: "Aún no realizada",
    scoreLabel: "Puntuación",
    back: "Volver a los cuestionarios",
    onlyOnce: "Esta prueba solo se puede realizar una vez.",
  },
  ru: {
    completedTitle: "{label} уже пройден",
    completedDesc:
      "Вы уже отправили свой {label} для «{title}». Каждый участник может пройти {label} только один раз.",
    nextInfo:
      "Ваш результат {label} надёжно сохранён. {other} появится здесь автоматически, как только администратор откроет его.",
    history: "История ваших попыток",
    preLabel: "Предварительный тест",
    postLabel: "Итоговый тест",
    notTakenYet: "Ещё не пройден",
    scoreLabel: "Баллы",
    back: "Вернуться к тестам",
    onlyOnce: "Этот тест можно пройти только один раз.",
  },
};

export function quizT(
  lang: Language,
  key: QuizStringKey,
  vars?: Record<string, string>,
): string {
  let str = STRINGS[lang]?.[key] || STRINGS.en[key] || key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}
