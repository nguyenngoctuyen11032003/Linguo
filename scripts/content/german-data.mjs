// Built-in allow-list of the German lint: words the Hunspell dictionary lacks (proper names, abbreviations,
// interjections, loan words). Project-specific words go to content/de/wordlist/*.txt instead (one per line).
// Matching is case-insensitive; `Word/Model` makes `Word` inflect like the dictionary word `Model`.

const words = (s) => s.split(/\s+/).filter(Boolean);

/** First names (German and Vietnamese) used in dialogues. */
const FIRST_NAMES = words(`
  Lukas Lena Sarah Sara Laura Jonas Klara Mia Lea Finn Leon Luca Ali Gabi Moritz Hannah Jana Nora Mehmet Yuki
  Anna Peter Maria Julia Thomas Sabine Michael Paul Max Hans Eva Tom Nina Jan Lisa Tim Felix David Sophie Karl
  Franz Emma Ben Noah Anton Bernd Birgit Claudia Daniel Elke Frank Heike Ingrid Jürgen Katrin Markus Monika
  Petra Stefan Susanne Uwe Wolfgang Ute Tobias Simon Elias Jana Lan Hoa Nam Linh Huy Anh Hung Thu Trang Hai
  Duc Tuan Phuong Long Minh Mai Lien Nga Thuy Quang Binh Son Tung Hanh Yen Dung Hieu Khoa Vy Tam
`);
/** Surnames and Vietnamese family names. */
const SURNAMES = words(`
  Müller Schmidt Schneider Fischer Weber Meyer Meier Wagner Becker Schulz Hoffmann Koch Richter Klein Wolf
  Nguyen Nguyễn Tran Trần Le Lê Pham Phạm Hoang Hoàng Huynh Huỳnh Phan Vu Vũ Dang Đặng Bui Bùi Do Đỗ Ho Hồ
  Ngo Ngô Duong Dương Ly Lý Thị Văn Đức
`);
/** Places: Vietnamese cities and a few German-language ones the dictionary may lack. */
const PLACES = words(`
  Hanoi Saigon Hue Hoi An Nang Da Lat Haiphong Vietnam Vietnamesen vietnamesisch/deutsch Vietnamesisch/Deutsch Hanoier Hanoierin Mekong Sapa Halong
  Tram Pham
`);
/** Interjections, colloquial words and loan words missing from igerman98. */
const COLLOQUIAL = words(`
  hi hey tja na aha ähm äh mhm hm hmm oh ach ui hui wow pst igitt ok okay ciao servus moin tschö tschüs
  Homeoffice Duolingo Master Azubi Babysitter Smartphone Podcast Streaming Online Offline App Apps WLAN Wlan Hashtag Selfie
  Email Emails Mail Mails Chat Chats SMS Facebook Instagram YouTube TikTok Zoom WhatsApp Google
`);
/** Abbreviations that appear without their dot (the tokenizer drops punctuation). */
const ABBREVIATIONS = words(`
  Sg Pl usw bzw ca evtl ggf vgl inkl Nr Str Tel Dr Hr Fr Prof Min Std Mio Mrd Jh geb Kl Abt bspw usf uvm od
  ua zB dh sog ev etc Akk Dat Gen Nom Adj Adv Präp Konj Part Inf Imp Perf Präs Prät Kon Pron Subst Mask Fem Neutr
  km kg cm mm ml kWh EU OG EG UG DG USA UNO TV PC DVD CD SMS PKW LKW ICE WG VHS EZB BAföG DaF DaZ GmbH AG
`);

export const BUILTIN_ALLOW = [...FIRST_NAMES, ...SURNAMES, ...PLACES, ...COLLOQUIAL, ...ABBREVIATIONS];
