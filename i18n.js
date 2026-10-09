/* Texts per language. My PC sends en, fr, es or ar in info.lang (es falls back to en).
 * 'ary' is Moroccan Darija: My PC never sends it, the owner turns it on with "lang": "ary" in the app config.
 * Arabic and Darija are right-to-left (the SDK sets dir="rtl" for ar, game.js does it for ary). */
window.TEXT = {
    en: { title: 'Advanced Game', play: 'Play', resume: 'Continue', quit: 'Quit', restart: 'Restart', menu: 'Menu',
          best: 'Best', score: 'Score', over: 'Game over', hint: 'Arrows to choose, OK to select' },
    fr: { title: 'Advanced Game', play: 'Jouer', resume: 'Continuer', quit: 'Quitter', restart: 'Recommencer', menu: 'Menu',
          best: 'Record', score: 'Score', over: 'Partie terminée', hint: 'Flèches pour choisir, OK pour valider' },
    ar: { title: 'Advanced Game', play: 'العب', resume: 'متابعة', quit: 'خروج', restart: 'إعادة البدء', menu: 'القائمة',
          best: 'الأفضل', score: 'النقاط', over: 'انتهت اللعبة', hint: 'الأسهم للاختيار، OK للتأكيد' },
    ary: { title: 'Advanced Game', play: 'لعب', resume: 'كمّل', quit: 'خرج', restart: 'عاود من الأول', menu: 'المونيو',
           best: 'أحسن نتيجة', score: 'النقط', over: 'سالات اللعبة', hint: 'الفليشات باش تختار، OK باش تأكد' }
};
window.RTL = { ar: true, ary: true };
