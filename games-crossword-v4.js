/* Mood Arcade Crossword V6 — "Word Connect" style puzzle.
 * Replaces the old fill-in-the-blank crossword stub with a real letter-wheel
 * word connect game: a circular set of draggable letters (the level's root
 * word, e.g. TAMED / SUNSET) which the player swipes across to spell every
 * valid word hidden in a crossword-shaped grid. Found words reveal their
 * letters in the grid; crossing letters from other, not-yet-found words
 * reveal automatically wherever they share a cell (same as commercial
 * word-connect games). 45 levels are generated offline from a real English
 * dictionary (see project notes) and baked into WC_LEVELS below — no
 * external requests, works fully offline like the rest of the arcade.
 */
(function(){
'use strict';
if(window.__MOOD_CROSSWORD_V6__)return;window.__MOOD_CROSSWORD_V6__=true;
const WC_LEVELS = [{"root":"PEOPLE","letters":["e","e","l","o","p","p"],"words":["EEL","ELOPE","LEE","LOPE","PEE","PEEL","PEEP","PEOPLE","PEP","PLOP","POLE","POP","POPE"],"placed":[{"word":"PEOPLE","r":2,"c":3,"d":"A"},{"word":"ELOPE","r":2,"c":0,"d":"A"},{"word":"PEEP","r":2,"c":3,"d":"D"},{"word":"PLOP","r":2,"c":6,"d":"D"},{"word":"PEEL","r":5,"c":3,"d":"D"},{"word":"LOPE","r":2,"c":1,"d":"A"},{"word":"POPE","r":0,"c":3,"d":"D"},{"word":"POLE","r":5,"c":6,"d":"A"},{"word":"EEL","r":6,"c":3,"d":"D"},{"word":"PEE","r":2,"c":3,"d":"D"},{"word":"POP","r":0,"c":3,"d":"D"},{"word":"PEP","r":5,"c":3,"d":"A"},{"word":"LEE","r":2,"c":7,"d":"A"}],"h":9,"w":10},{"root":"PUBLIC","letters":["b","c","i","l","p","u"],"words":["BLIP","CLIP","CLUB","CUB","CUP","LIB","LIP","PUB","PUBIC","PUBLIC"],"placed":[{"word":"PUBLIC","r":0,"c":0,"d":"A"},{"word":"PUBIC","r":0,"c":0,"d":"D"},{"word":"CLIP","r":0,"c":5,"d":"A"},{"word":"CLUB","r":0,"c":5,"d":"D"},{"word":"BLIP","r":0,"c":2,"d":"D"},{"word":"CUB","r":4,"c":0,"d":"A"},{"word":"LIP","r":0,"c":6,"d":"A"},{"word":"LIB","r":0,"c":3,"d":"D"},{"word":"CUP","r":4,"c":0,"d":"D"},{"word":"PUB","r":0,"c":0,"d":"A"}],"h":7,"w":9},{"root":"SCHOOL","letters":["c","h","l","o","o","s"],"words":["COLS","COO","COOL","COOLS","COOS","SCHOOL","SHOO","SOLO"],"placed":[{"word":"SCHOOL","r":0,"c":2,"d":"A"},{"word":"COOLS","r":0,"c":3,"d":"D"},{"word":"SOLO","r":0,"c":2,"d":"D"},{"word":"COOL","r":0,"c":3,"d":"D"},{"word":"SHOO","r":1,"c":0,"d":"A"},{"word":"COLS","r":3,"c":1,"d":"A"},{"word":"COOS","r":3,"c":1,"d":"D"},{"word":"COO","r":0,"c":3,"d":"D"}],"h":7,"w":8},{"root":"CENTER","letters":["c","e","e","n","r","t"],"words":["CENT","CENTER","ENTER","ERE","ERECT","NET","RENT","TEE","TEEN","TEN","TREE"],"placed":[{"word":"CENTER","r":0,"c":0,"d":"A"},{"word":"ENTER","r":0,"c":1,"d":"A"},{"word":"ERECT","r":0,"c":4,"d":"A"},{"word":"TEEN","r":0,"c":3,"d":"D"},{"word":"CENT","r":0,"c":0,"d":"A"},{"word":"RENT","r":0,"c":5,"d":"D"},{"word":"TREE","r":0,"c":8,"d":"D"},{"word":"TEE","r":0,"c":3,"d":"D"},{"word":"NET","r":3,"c":3,"d":"A"},{"word":"TEN","r":3,"c":5,"d":"A"},{"word":"ERE","r":0,"c":4,"d":"A"}],"h":4,"w":9},{"root":"MEMBER","letters":["b","e","e","m","m","r"],"words":["BEE","BEER","EMBER","ERE","MEMBER","MEME","MERE"],"placed":[{"word":"MEMBER","r":0,"c":2,"d":"A"},{"word":"EMBER","r":0,"c":3,"d":"A"},{"word":"MEME","r":0,"c":0,"d":"A"},{"word":"BEER","r":0,"c":5,"d":"D"},{"word":"MERE","r":0,"c":2,"d":"D"},{"word":"BEE","r":0,"c":5,"d":"D"},{"word":"ERE","r":1,"c":2,"d":"D"}],"h":4,"w":8},{"root":"OFFICE","letters":["c","e","f","f","i","o"],"words":["FIE","FIEF","FIFE","FOE","ICE","OFF","OFFICE"],"placed":[{"word":"OFFICE","r":0,"c":0,"d":"A"},{"word":"FIFE","r":0,"c":1,"d":"D"},{"word":"FIEF","r":0,"c":2,"d":"D"},{"word":"FIE","r":0,"c":2,"d":"D"},{"word":"OFF","r":0,"c":0,"d":"A"},{"word":"ICE","r":0,"c":3,"d":"A"},{"word":"FOE","r":3,"c":2,"d":"A"}],"h":4,"w":6},{"root":"WITHIN","letters":["h","i","i","n","t","w"],"words":["HINT","HIT","NIT","THIN","TIN","TWIN","WHIT","WIN","WIT","WITH","WITHIN"],"placed":[{"word":"WITHIN","r":0,"c":0,"d":"A"},{"word":"WHIT","r":0,"c":0,"d":"D"},{"word":"THIN","r":0,"c":2,"d":"A"},{"word":"WITH","r":0,"c":0,"d":"A"},{"word":"HINT","r":0,"c":3,"d":"A"},{"word":"TWIN","r":0,"c":2,"d":"D"},{"word":"HIT","r":1,"c":0,"d":"D"},{"word":"WIN","r":1,"c":2,"d":"D"},{"word":"NIT","r":0,"c":5,"d":"D"},{"word":"WIT","r":0,"c":0,"d":"A"},{"word":"TIN","r":3,"c":0,"d":"A"}],"h":4,"w":7},{"root":"ACCESS","letters":["a","c","c","e","s","s"],"words":["ACCESS","ACE","ACES","ASS","CASE","CASES","SACS","SEA","SEAS","SECS"],"placed":[{"word":"ACCESS","r":0,"c":0,"d":"A"},{"word":"CASES","r":0,"c":1,"d":"D"},{"word":"SEAS","r":0,"c":4,"d":"D"},{"word":"SACS","r":0,"c":5,"d":"A"},{"word":"CASE","r":0,"c":1,"d":"D"},{"word":"ACES","r":0,"c":0,"d":"D"},{"word":"SECS","r":3,"c":0,"d":"A"},{"word":"ASS","r":2,"c":4,"d":"D"},{"word":"SEA","r":0,"c":4,"d":"D"},{"word":"ACE","r":0,"c":0,"d":"D"}],"h":5,"w":9},{"root":"CHANGE","letters":["a","c","e","g","h","n"],"words":["ACE","ACHE","ACNE","AGE","CAGE","CAN","CANE","CHANGE","EACH","HAG","HANG","HEN","NAG"],"placed":[{"word":"CHANGE","r":3,"c":0,"d":"A"},{"word":"ACHE","r":3,"c":2,"d":"D"},{"word":"HANG","r":3,"c":1,"d":"A"},{"word":"CAGE","r":3,"c":0,"d":"D"},{"word":"ACNE","r":4,"c":1,"d":"A"},{"word":"CANE","r":0,"c":5,"d":"D"},{"word":"EACH","r":2,"c":2,"d":"D"},{"word":"HEN","r":5,"c":2,"d":"D"},{"word":"CAN","r":0,"c":5,"d":"D"},{"word":"HAG","r":3,"c":1,"d":"D"},{"word":"NAG","r":4,"c":3,"d":"D"},{"word":"ACE","r":1,"c":5,"d":"A"},{"word":"AGE","r":4,"c":0,"d":"D"}],"h":8,"w":8},{"root":"QUALITY","letters":["a","i","l","q","t","u","y"],"words":["AIL","ALT","LAT","LAY","LIT","QUA","QUAIL","QUALITY","QUAY","QUILT","QUIT","TAIL"],"placed":[{"word":"QUALITY","r":1,"c":1,"d":"A"},{"word":"QUAIL","r":1,"c":1,"d":"D"},{"word":"QUILT","r":0,"c":2,"d":"D"},{"word":"QUAY","r":0,"c":2,"d":"A"},{"word":"TAIL","r":1,"c":6,"d":"D"},{"word":"QUIT","r":2,"c":0,"d":"A"},{"word":"LIT","r":1,"c":4,"d":"A"},{"word":"QUA","r":1,"c":1,"d":"A"},{"word":"AIL","r":3,"c":1,"d":"D"},{"word":"LAY","r":1,"c":4,"d":"D"},{"word":"LAT","r":5,"c":1,"d":"A"},{"word":"ALT","r":3,"c":1,"d":"A"}],"h":6,"w":8},{"root":"BETTER","letters":["b","e","e","r","t","t"],"words":["BEE","BEER","BEET","BERET","BET","BETTER","ERE","TEE","TREE"],"placed":[{"word":"BETTER","r":1,"c":1,"d":"A"},{"word":"BERET","r":1,"c":1,"d":"D"},{"word":"BEET","r":0,"c":2,"d":"D"},{"word":"BEER","r":2,"c":0,"d":"A"},{"word":"TREE","r":1,"c":3,"d":"D"},{"word":"TEE","r":3,"c":2,"d":"A"},{"word":"BEE","r":0,"c":2,"d":"D"},{"word":"BET","r":1,"c":1,"d":"A"},{"word":"ERE","r":2,"c":1,"d":"D"}],"h":6,"w":7},{"root":"MEMORY","letters":["e","m","m","o","r","y"],"words":["EMO","MEMO","MEMORY","MOM","MORE","ORE","ROE","RYE","YORE"],"placed":[{"word":"MEMORY","r":0,"c":0,"d":"A"},{"word":"MEMO","r":0,"c":0,"d":"A"},{"word":"YORE","r":0,"c":5,"d":"A"},{"word":"MORE","r":0,"c":0,"d":"D"},{"word":"EMO","r":0,"c":1,"d":"A"},{"word":"ROE","r":0,"c":4,"d":"D"},{"word":"ORE","r":0,"c":6,"d":"A"},{"word":"RYE","r":0,"c":7,"d":"D"},{"word":"MOM","r":0,"c":2,"d":"D"}],"h":4,"w":9},{"root":"AUGUST","letters":["a","g","s","t","u","u"],"words":["AUGUST","GAS","GUST","GUT","GUTS","SAG","SAT","STAG","TAG","TAGS","TUG","TUGS"],"placed":[{"word":"AUGUST","r":0,"c":0,"d":"A"},{"word":"TUGS","r":0,"c":5,"d":"A"},{"word":"STAG","r":0,"c":4,"d":"D"},{"word":"TAGS","r":1,"c":4,"d":"D"},{"word":"GUTS","r":0,"c":2,"d":"D"},{"word":"GUST","r":0,"c":2,"d":"A"},{"word":"SAT","r":0,"c":8,"d":"D"},{"word":"GUT","r":0,"c":2,"d":"D"},{"word":"TAG","r":1,"c":4,"d":"D"},{"word":"TUG","r":0,"c":5,"d":"A"},{"word":"GAS","r":0,"c":7,"d":"D"},{"word":"SAG","r":3,"c":2,"d":"A"}],"h":5,"w":9},{"root":"STATUS","letters":["a","s","s","t","t","u"],"words":["ASS","ASST","SAT","STAT","STATS","STATUS","TAT","TATS","TAUT"],"placed":[{"word":"STATUS","r":0,"c":2,"d":"A"},{"word":"STATS","r":0,"c":2,"d":"D"},{"word":"TAUT","r":0,"c":3,"d":"D"},{"word":"TATS","r":1,"c":2,"d":"D"},{"word":"ASST","r":0,"c":0,"d":"A"},{"word":"STAT","r":0,"c":2,"d":"A"},{"word":"SAT","r":0,"c":7,"d":"A"},{"word":"ASS","r":0,"c":0,"d":"A"},{"word":"TAT","r":0,"c":3,"d":"A"}],"h":5,"w":10},{"root":"FUTURE","letters":["e","f","r","t","u","u"],"words":["FER","FRET","FUR","FUTURE","REF","RUE","RUT","TRUE","TURF"],"placed":[{"word":"FUTURE","r":0,"c":0,"d":"A"},{"word":"TURF","r":0,"c":2,"d":"D"},{"word":"FRET","r":0,"c":0,"d":"D"},{"word":"TRUE","r":3,"c":0,"d":"D"},{"word":"RUE","r":4,"c":0,"d":"D"},{"word":"FER","r":3,"c":2,"d":"A"},{"word":"REF","r":0,"c":4,"d":"A"},{"word":"RUT","r":0,"c":4,"d":"D"},{"word":"FUR","r":3,"c":2,"d":"D"}],"h":7,"w":7},{"root":"BECOME","letters":["b","c","e","e","m","o"],"words":["BECOME","BEE","COB","COMB","COME","EMO","MOB"],"placed":[{"word":"BECOME","r":1,"c":0,"d":"A"},{"word":"COMB","r":1,"c":2,"d":"D"},{"word":"COME","r":1,"c":2,"d":"A"},{"word":"COB","r":0,"c":3,"d":"D"},{"word":"EMO","r":1,"c":1,"d":"D"},{"word":"MOB","r":2,"c":1,"d":"A"},{"word":"BEE","r":1,"c":0,"d":"D"}],"h":5,"w":6},{"root":"ENERGY","letters":["e","e","g","n","r","y"],"words":["EERY","ENERGY","ERE","ERG","EYE","GEE","GENE","GENRE","GREEN","GREY","RYE","YEN"],"placed":[{"word":"ENERGY","r":1,"c":3,"d":"A"},{"word":"GREEN","r":1,"c":0,"d":"A"},{"word":"GENRE","r":1,"c":7,"d":"D"},{"word":"GENE","r":1,"c":0,"d":"D"},{"word":"GREY","r":0,"c":6,"d":"D"},{"word":"EERY","r":2,"c":6,"d":"A"},{"word":"EYE","r":2,"c":6,"d":"D"},{"word":"RYE","r":2,"c":8,"d":"A"},{"word":"ERG","r":1,"c":5,"d":"A"},{"word":"YEN","r":3,"c":6,"d":"D"},{"word":"GEE","r":2,"c":5,"d":"A"},{"word":"ERE","r":4,"c":6,"d":"A"}],"h":6,"w":11},{"root":"JOURNAL","letters":["a","j","l","n","o","r","u"],"words":["JAR","JOURNAL","LOAN","LORN","LUNAR","NOR","OAR","ORAL","OUR","RAN","ROAN","RUN","ULNA","URN"],"placed":[{"word":"JOURNAL","r":1,"c":0,"d":"A"},{"word":"LUNAR","r":1,"c":6,"d":"D"},{"word":"ROAN","r":1,"c":3,"d":"D"},{"word":"LOAN","r":1,"c":6,"d":"A"},{"word":"ORAL","r":1,"c":1,"d":"D"},{"word":"LORN","r":4,"c":1,"d":"D"},{"word":"ULNA","r":1,"c":2,"d":"D"},{"word":"NOR","r":0,"c":1,"d":"D"},{"word":"OAR","r":2,"c":3,"d":"A"},{"word":"URN","r":1,"c":2,"d":"A"},{"word":"RAN","r":3,"c":0,"d":"A"},{"word":"OUR","r":1,"c":1,"d":"A"},{"word":"RUN","r":2,"c":5,"d":"A"},{"word":"JAR","r":1,"c":0,"d":"D"}],"h":8,"w":10},{"root":"HAVING","letters":["a","g","h","i","n","v"],"words":["ANI","AVG","GAIN","GIN","HAG","HANG","HAVING","HING","NAG","NIGH","VAIN","VAN","VIA"],"placed":[{"word":"HAVING","r":1,"c":0,"d":"A"},{"word":"GAIN","r":1,"c":5,"d":"A"},{"word":"HANG","r":1,"c":0,"d":"D"},{"word":"HING","r":0,"c":3,"d":"D"},{"word":"NIGH","r":1,"c":4,"d":"D"},{"word":"VAIN","r":1,"c":2,"d":"D"},{"word":"GIN","r":4,"c":0,"d":"A"},{"word":"HAG","r":0,"c":3,"d":"A"},{"word":"VAN","r":2,"c":1,"d":"A"},{"word":"NAG","r":1,"c":8,"d":"D"},{"word":"VIA","r":0,"c":7,"d":"D"},{"word":"ANI","r":2,"c":2,"d":"A"},{"word":"AVG","r":1,"c":1,"d":"D"}],"h":5,"w":9},{"root":"COMMON","letters":["c","m","m","n","o","o"],"words":["COMM","COMMON","CON","COO","COON","MOM","MONO","MOO","MOON"],"placed":[{"word":"COMMON","r":1,"c":0,"d":"A"},{"word":"COON","r":1,"c":0,"d":"D"},{"word":"MONO","r":1,"c":3,"d":"A"},{"word":"COMM","r":1,"c":0,"d":"A"},{"word":"MOON","r":1,"c":2,"d":"D"},{"word":"MOO","r":1,"c":2,"d":"D"},{"word":"MOM","r":1,"c":3,"d":"D"},{"word":"CON","r":0,"c":1,"d":"D"},{"word":"COO","r":1,"c":0,"d":"D"}],"h":5,"w":7},{"root":"LIVING","letters":["g","i","i","l","n","v"],"words":["GIN","LII","LIVING","LVI","LVII","NIL","VIGIL","VII"],"placed":[{"word":"LIVING","r":0,"c":0,"d":"A"},{"word":"VIGIL","r":0,"c":2,"d":"D"},{"word":"LVII","r":0,"c":0,"d":"D"},{"word":"GIN","r":0,"c":5,"d":"A"},{"word":"NIL","r":0,"c":4,"d":"D"},{"word":"LII","r":4,"c":2,"d":"A"},{"word":"VII","r":1,"c":0,"d":"D"},{"word":"LVI","r":0,"c":0,"d":"D"}],"h":5,"w":8},{"root":"USUALLY","letters":["a","l","l","s","u","u","y"],"words":["ALL","ALLY","LAY","LAYS","LUAU","LUAUS","SALLY","SAY","SLAY","SLY","SULLY","USUAL","USUALLY"],"placed":[{"word":"USUALLY","r":1,"c":3,"d":"A"},{"word":"USUAL","r":1,"c":3,"d":"A"},{"word":"SALLY","r":1,"c":4,"d":"D"},{"word":"SULLY","r":0,"c":3,"d":"D"},{"word":"LUAUS","r":1,"c":0,"d":"A"},{"word":"ALLY","r":1,"c":6,"d":"A"},{"word":"SLAY","r":2,"c":2,"d":"A"},{"word":"LUAU","r":1,"c":0,"d":"A"},{"word":"LAYS","r":2,"c":3,"d":"A"},{"word":"LAY","r":2,"c":3,"d":"A"},{"word":"ALL","r":1,"c":6,"d":"A"},{"word":"SAY","r":0,"c":3,"d":"A"},{"word":"SLY","r":2,"c":2,"d":"D"}],"h":6,"w":10},{"root":"LYRICS","letters":["c","i","l","r","s","y"],"words":["CIS","CRY","ICY","LYRIC","LYRICS","SIC","SIR","SLY","YRS"],"placed":[{"word":"LYRICS","r":1,"c":1,"d":"A"},{"word":"LYRIC","r":1,"c":1,"d":"A"},{"word":"CIS","r":1,"c":5,"d":"D"},{"word":"CRY","r":0,"c":3,"d":"D"},{"word":"ICY","r":1,"c":4,"d":"D"},{"word":"SLY","r":1,"c":0,"d":"A"},{"word":"SIC","r":0,"c":4,"d":"D"},{"word":"SIR","r":1,"c":6,"d":"A"},{"word":"YRS","r":1,"c":2,"d":"D"}],"h":4,"w":9},{"root":"CHOOSE","letters":["c","e","h","o","o","s"],"words":["CHOOSE","CHOSE","COO","COOS","ECHO","ECHOS","HES","HOE","HOES","HOSE","SHE","SHOE","SHOO"],"placed":[{"word":"CHOOSE","r":0,"c":0,"d":"A"},{"word":"ECHOS","r":0,"c":5,"d":"A"},{"word":"CHOSE","r":0,"c":0,"d":"D"},{"word":"SHOE","r":0,"c":4,"d":"D"},{"word":"ECHO","r":0,"c":5,"d":"A"},{"word":"HOSE","r":1,"c":0,"d":"D"},{"word":"SHOO","r":0,"c":9,"d":"D"},{"word":"HOES","r":1,"c":4,"d":"D"},{"word":"COOS","r":0,"c":6,"d":"D"},{"word":"SHE","r":3,"c":0,"d":"A"},{"word":"HOE","r":1,"c":4,"d":"D"},{"word":"HES","r":3,"c":1,"d":"A"},{"word":"COO","r":0,"c":6,"d":"D"}],"h":5,"w":10},{"root":"RECEIVE","letters":["c","e","e","e","i","r","v"],"words":["EERIE","ERE","EVE","EVER","ICE","IRE","RECEIVE","REEVE","REV","RICE","VEER","VICE","VIE"],"placed":[{"word":"RECEIVE","r":1,"c":0,"d":"A"},{"word":"REEVE","r":1,"c":0,"d":"D"},{"word":"EERIE","r":1,"c":1,"d":"D"},{"word":"VICE","r":4,"c":0,"d":"A"},{"word":"VEER","r":0,"c":1,"d":"D"},{"word":"RICE","r":3,"c":1,"d":"A"},{"word":"EVER","r":3,"c":0,"d":"D"},{"word":"REV","r":6,"c":0,"d":"A"},{"word":"IRE","r":1,"c":4,"d":"D"},{"word":"VIE","r":1,"c":5,"d":"D"},{"word":"ICE","r":4,"c":1,"d":"A"},{"word":"EVE","r":3,"c":0,"d":"D"},{"word":"ERE","r":5,"c":0,"d":"D"}],"h":8,"w":7},{"root":"GOOGLE","letters":["e","g","g","l","o","o"],"words":["EGG","EGO","GEL","GOO","GOOGLE","LEG","LOG","LOGE","LOGO","OGLE","OLEO"],"placed":[{"word":"GOOGLE","r":0,"c":2,"d":"A"},{"word":"LOGE","r":0,"c":6,"d":"D"},{"word":"LOGO","r":0,"c":0,"d":"A"},{"word":"OGLE","r":0,"c":4,"d":"A"},{"word":"OLEO","r":0,"c":3,"d":"D"},{"word":"LOG","r":0,"c":6,"d":"D"},{"word":"LEG","r":0,"c":6,"d":"A"},{"word":"GEL","r":2,"c":6,"d":"D"},{"word":"GOO","r":0,"c":2,"d":"A"},{"word":"EGG","r":0,"c":7,"d":"A"},{"word":"EGO","r":0,"c":7,"d":"D"}],"h":5,"w":10},{"root":"HIGHER","letters":["e","g","h","h","i","r"],"words":["ERG","HEIR","HER","HIE","HIGH","HIGHER","HIRE","IRE","REHI","RIG"],"placed":[{"word":"HIGHER","r":1,"c":2,"d":"A"},{"word":"HEIR","r":1,"c":2,"d":"D"},{"word":"REHI","r":1,"c":0,"d":"A"},{"word":"HIRE","r":1,"c":5,"d":"D"},{"word":"HIGH","r":1,"c":2,"d":"A"},{"word":"IRE","r":2,"c":5,"d":"D"},{"word":"ERG","r":1,"c":6,"d":"A"},{"word":"RIG","r":1,"c":7,"d":"D"},{"word":"HER","r":1,"c":5,"d":"A"},{"word":"HIE","r":0,"c":3,"d":"D"}],"h":5,"w":9},{"root":"EFFECTS","letters":["c","e","e","f","f","s","t"],"words":["EFFECT","EFFECTS","EST","FECES","FEE","FEES","FEET","FEST","SECT","SEE","SET","TEE","TEES"],"placed":[{"word":"EFFECTS","r":1,"c":0,"d":"A"},{"word":"EFFECT","r":1,"c":0,"d":"A"},{"word":"FECES","r":1,"c":1,"d":"D"},{"word":"FEES","r":1,"c":2,"d":"D"},{"word":"FEET","r":2,"c":0,"d":"A"},{"word":"FEST","r":4,"c":0,"d":"A"},{"word":"SECT","r":1,"c":6,"d":"A"},{"word":"TEES","r":1,"c":5,"d":"D"},{"word":"FEE","r":1,"c":2,"d":"D"},{"word":"TEE","r":1,"c":5,"d":"D"},{"word":"SET","r":0,"c":3,"d":"D"},{"word":"EST","r":4,"c":1,"d":"A"},{"word":"SEE","r":1,"c":6,"d":"D"}],"h":6,"w":10},{"root":"REMEMBER","letters":["b","e","e","e","m","m","r","r"],"words":["BEE","BEER","BRR","EMBER","ERE","ERR","MEMBER","MEME","MERE","REMEMBER"],"placed":[{"word":"REMEMBER","r":1,"c":0,"d":"A"},{"word":"MEMBER","r":1,"c":2,"d":"A"},{"word":"EMBER","r":1,"c":3,"d":"A"},{"word":"MEME","r":1,"c":2,"d":"D"},{"word":"BEER","r":1,"c":5,"d":"D"},{"word":"MERE","r":3,"c":2,"d":"A"},{"word":"BRR","r":0,"c":0,"d":"D"},{"word":"ERR","r":1,"c":6,"d":"A"},{"word":"BEE","r":1,"c":5,"d":"D"},{"word":"ERE","r":3,"c":3,"d":"A"}],"h":5,"w":9},{"root":"YELLOW","letters":["e","l","l","o","w","y"],"words":["ELL","LOW","LOWLY","LYE","OWE","OWL","WELL","WOE","YELL","YELLOW","YEW","YOWL"],"placed":[{"word":"YELLOW","r":1,"c":0,"d":"A"},{"word":"LOWLY","r":1,"c":3,"d":"A"},{"word":"YELL","r":1,"c":0,"d":"A"},{"word":"WELL","r":1,"c":5,"d":"D"},{"word":"YOWL","r":1,"c":0,"d":"D"},{"word":"OWL","r":1,"c":4,"d":"A"},{"word":"OWE","r":0,"c":5,"d":"D"},{"word":"LYE","r":1,"c":6,"d":"A"},{"word":"WOE","r":3,"c":0,"d":"A"},{"word":"YEW","r":1,"c":7,"d":"A"},{"word":"LOW","r":1,"c":3,"d":"A"},{"word":"ELL","r":1,"c":1,"d":"A"}],"h":5,"w":10},{"root":"FRENCH","letters":["c","e","f","h","n","r"],"words":["CHEF","FEN","FER","FERN","FRENCH","HEN","HER","REF"],"placed":[{"word":"FRENCH","r":1,"c":0,"d":"A"},{"word":"FERN","r":1,"c":0,"d":"D"},{"word":"CHEF","r":1,"c":4,"d":"A"},{"word":"HEN","r":1,"c":5,"d":"D"},{"word":"FER","r":1,"c":0,"d":"D"},{"word":"REF","r":1,"c":1,"d":"D"},{"word":"HER","r":0,"c":2,"d":"D"},{"word":"FEN","r":1,"c":7,"d":"A"}],"h":5,"w":10},{"root":"ENGINE","letters":["e","e","g","i","n","n"],"words":["ENGINE","GEE","GENE","GENIE","GIN","INN","NINE"],"placed":[{"word":"ENGINE","r":1,"c":0,"d":"A"},{"word":"GENIE","r":1,"c":2,"d":"D"},{"word":"GENE","r":0,"c":0,"d":"D"},{"word":"NINE","r":1,"c":1,"d":"D"},{"word":"GIN","r":1,"c":2,"d":"A"},{"word":"INN","r":1,"c":3,"d":"D"},{"word":"GEE","r":0,"c":0,"d":"A"}],"h":6,"w":6},{"root":"SCREEN","letters":["c","e","e","n","r","s"],"words":["ERE","SCENE","SCREEN","SEE","SEEN","SEER","SERE","SNEER"],"placed":[{"word":"SCREEN","r":2,"c":1,"d":"A"},{"word":"SNEER","r":2,"c":1,"d":"D"},{"word":"SCENE","r":1,"c":2,"d":"D"},{"word":"SEEN","r":5,"c":0,"d":"A"},{"word":"SEER","r":1,"c":2,"d":"A"},{"word":"SERE","r":0,"c":3,"d":"D"},{"word":"SEE","r":1,"c":2,"d":"A"},{"word":"ERE","r":1,"c":3,"d":"D"}],"h":7,"w":7},{"root":"VOLUME","letters":["e","l","m","o","u","v"],"words":["ELM","EMO","EMU","LOVE","MOLE","MOVE","MULE","OVULE","OVUM","VOL","VOLE","VOLUME"],"placed":[{"word":"VOLUME","r":2,"c":1,"d":"A"},{"word":"OVULE","r":2,"c":2,"d":"D"},{"word":"MULE","r":2,"c":5,"d":"D"},{"word":"LOVE","r":5,"c":2,"d":"A"},{"word":"OVUM","r":5,"c":3,"d":"D"},{"word":"VOLE","r":2,"c":1,"d":"D"},{"word":"MOVE","r":3,"c":0,"d":"A"},{"word":"MOLE","r":0,"c":3,"d":"D"},{"word":"EMO","r":3,"c":3,"d":"D"},{"word":"EMU","r":3,"c":3,"d":"A"},{"word":"ELM","r":2,"c":6,"d":"A"},{"word":"VOL","r":2,"c":1,"d":"A"}],"h":9,"w":9},{"root":"COMING","letters":["c","g","i","m","n","o"],"words":["COG","COIN","COMING","CON","GIN","ICON","INC","ION","MIN"],"placed":[{"word":"COMING","r":0,"c":0,"d":"A"},{"word":"COIN","r":0,"c":0,"d":"D"},{"word":"ICON","r":0,"c":3,"d":"D"},{"word":"MIN","r":0,"c":2,"d":"A"},{"word":"GIN","r":0,"c":5,"d":"A"},{"word":"COG","r":1,"c":3,"d":"A"},{"word":"INC","r":2,"c":0,"d":"D"},{"word":"ION","r":2,"c":0,"d":"A"},{"word":"CON","r":1,"c":3,"d":"D"}],"h":5,"w":8},{"root":"OBJECT","letters":["b","c","e","j","o","t"],"words":["BET","BOT","COB","COT","COTE","JET","JOB","JOT","OBJ","OBJECT","TOE"],"placed":[{"word":"OBJECT","r":1,"c":1,"d":"A"},{"word":"COTE","r":1,"c":5,"d":"D"},{"word":"COB","r":1,"c":0,"d":"A"},{"word":"JOT","r":1,"c":3,"d":"D"},{"word":"BOT","r":1,"c":2,"d":"D"},{"word":"COT","r":1,"c":5,"d":"D"},{"word":"JOB","r":0,"c":1,"d":"D"},{"word":"BET","r":2,"c":1,"d":"D"},{"word":"TOE","r":1,"c":6,"d":"A"},{"word":"JET","r":3,"c":0,"d":"A"},{"word":"OBJ","r":1,"c":1,"d":"A"}],"h":5,"w":9},{"root":"FOLLOW","letters":["f","l","l","o","o","w"],"words":["FLOW","FOLLOW","FOO","FOOL","FOWL","LOW","OWL","WOLF","WOO","WOOF","WOOL"],"placed":[{"word":"FOLLOW","r":1,"c":1,"d":"A"},{"word":"FOWL","r":1,"c":1,"d":"D"},{"word":"WOOF","r":1,"c":6,"d":"A"},{"word":"FLOW","r":1,"c":9,"d":"D"},{"word":"FOOL","r":0,"c":2,"d":"D"},{"word":"WOOL","r":2,"c":0,"d":"A"},{"word":"WOLF","r":1,"c":6,"d":"D"},{"word":"FOO","r":0,"c":2,"d":"D"},{"word":"OWL","r":2,"c":1,"d":"D"},{"word":"WOO","r":1,"c":6,"d":"A"},{"word":"LOW","r":1,"c":4,"d":"A"}],"h":5,"w":10},{"root":"CHOICE","letters":["c","c","e","h","i","o"],"words":["CHI","CHIC","CHOICE","ECHO","HIE","HOE","ICE"],"placed":[{"word":"CHOICE","r":0,"c":1,"d":"A"},{"word":"ECHO","r":0,"c":0,"d":"A"},{"word":"CHIC","r":0,"c":1,"d":"D"},{"word":"CHI","r":0,"c":1,"d":"D"},{"word":"HOE","r":0,"c":2,"d":"D"},{"word":"HIE","r":2,"c":0,"d":"A"},{"word":"ICE","r":0,"c":4,"d":"A"}],"h":4,"w":7},{"root":"LEVELS","letters":["e","e","l","l","s","v"],"words":["EEL","EELS","ELL","ELLS","ELSE","ELVES","EVE","EVES","LEE","LEES","LEVEL","LEVELS","SEE","SELL"],"placed":[{"word":"LEVELS","r":0,"c":0,"d":"A"},{"word":"LEVEL","r":0,"c":0,"d":"A"},{"word":"ELVES","r":0,"c":1,"d":"D"},{"word":"EELS","r":0,"c":3,"d":"D"},{"word":"SELL","r":0,"c":5,"d":"A"},{"word":"ELLS","r":0,"c":6,"d":"A"},{"word":"ELSE","r":0,"c":3,"d":"A"},{"word":"EVES","r":1,"c":3,"d":"A"},{"word":"LEES","r":3,"c":0,"d":"A"},{"word":"EEL","r":0,"c":3,"d":"D"},{"word":"LEE","r":3,"c":0,"d":"A"},{"word":"EVE","r":0,"c":1,"d":"A"},{"word":"ELL","r":0,"c":6,"d":"A"},{"word":"SEE","r":0,"c":5,"d":"D"}],"h":5,"w":10},{"root":"LETTER","letters":["e","e","l","r","t","t"],"words":["EEL","ERE","LEE","LEER","LET","LETTER","REEL","TEE","TEL","TREE"],"placed":[{"word":"LETTER","r":1,"c":0,"d":"A"},{"word":"REEL","r":1,"c":5,"d":"A"},{"word":"LEER","r":1,"c":0,"d":"D"},{"word":"TREE","r":1,"c":2,"d":"D"},{"word":"EEL","r":1,"c":6,"d":"A"},{"word":"TEE","r":1,"c":3,"d":"D"},{"word":"TEL","r":0,"c":1,"d":"D"},{"word":"LEE","r":1,"c":0,"d":"D"},{"word":"LET","r":1,"c":0,"d":"A"},{"word":"ERE","r":1,"c":4,"d":"A"}],"h":5,"w":9},{"root":"DEGREE","letters":["d","e","e","e","g","r"],"words":["DEER","DEGREE","EDGE","EDGER","ERE","ERG","GEE","GEED","GREED","RED","REED"],"placed":[{"word":"DEGREE","r":2,"c":0,"d":"A"},{"word":"EDGER","r":2,"c":1,"d":"D"},{"word":"GREED","r":2,"c":2,"d":"A"},{"word":"EDGE","r":2,"c":1,"d":"D"},{"word":"DEER","r":2,"c":0,"d":"D"},{"word":"REED","r":2,"c":3,"d":"A"},{"word":"GEED","r":0,"c":1,"d":"D"},{"word":"RED","r":5,"c":0,"d":"A"},{"word":"ERG","r":5,"c":1,"d":"D"},{"word":"GEE","r":0,"c":1,"d":"D"},{"word":"ERE","r":4,"c":0,"d":"D"}],"h":8,"w":7},{"root":"SURVEY","letters":["e","r","s","u","v","y"],"words":["REV","REVS","RUE","RUES","RUSE","RYE","SUE","SURE","SURVEY","USE","USER","VERY","YES","YRS"],"placed":[{"word":"SURVEY","r":2,"c":0,"d":"A"},{"word":"VERY","r":2,"c":3,"d":"D"},{"word":"REVS","r":2,"c":2,"d":"D"},{"word":"SURE","r":0,"c":2,"d":"D"},{"word":"RUSE","r":4,"c":3,"d":"A"},{"word":"RUES","r":1,"c":1,"d":"D"},{"word":"USER","r":4,"c":4,"d":"A"},{"word":"SUE","r":2,"c":0,"d":"D"},{"word":"USE","r":4,"c":4,"d":"A"},{"word":"RUE","r":1,"c":1,"d":"D"},{"word":"YES","r":2,"c":5,"d":"D"},{"word":"YRS","r":2,"c":5,"d":"A"},{"word":"RYE","r":4,"c":3,"d":"D"},{"word":"REV","r":2,"c":2,"d":"D"}],"h":7,"w":8},{"root":"CLASSIC","letters":["a","c","c","i","l","s","s"],"words":["AIL","AILS","ASS","CAL","CIS","CLASS","CLASSIC","LASS","SACS","SAIL","SAILS","SIC","SICS","SISAL"],"placed":[{"word":"CLASSIC","r":0,"c":0,"d":"A"},{"word":"CLASS","r":0,"c":0,"d":"A"},{"word":"SISAL","r":0,"c":3,"d":"D"},{"word":"SAILS","r":0,"c":4,"d":"D"},{"word":"SACS","r":4,"c":4,"d":"A"},{"word":"LASS","r":0,"c":1,"d":"A"},{"word":"SICS","r":0,"c":4,"d":"A"},{"word":"AILS","r":1,"c":4,"d":"D"},{"word":"SAIL","r":0,"c":4,"d":"D"},{"word":"CIS","r":0,"c":0,"d":"D"},{"word":"AIL","r":1,"c":4,"d":"D"},{"word":"ASS","r":0,"c":2,"d":"A"},{"word":"SIC","r":0,"c":4,"d":"A"},{"word":"CAL","r":3,"c":2,"d":"A"}],"h":5,"w":8},{"root":"SUCCESS","letters":["c","c","e","s","s","s","u"],"words":["CUE","CUES","CUSS","CUSSES","SECS","SUCCESS","SUE","SUES","USE","USES"],"placed":[{"word":"SUCCESS","r":0,"c":1,"d":"A"},{"word":"CUSSES","r":0,"c":3,"d":"D"},{"word":"SUES","r":0,"c":1,"d":"D"},{"word":"CUSS","r":0,"c":3,"d":"D"},{"word":"SECS","r":2,"c":0,"d":"A"},{"word":"CUES","r":0,"c":4,"d":"D"},{"word":"USES","r":3,"c":0,"d":"A"},{"word":"SUE","r":0,"c":1,"d":"D"},{"word":"USE","r":3,"c":0,"d":"A"},{"word":"CUE","r":0,"c":4,"d":"D"}],"h":6,"w":8},{"root":"MAXIMUM","letters":["a","i","m","m","m","u","x"],"words":["AIM","IMAM","MAIM","MAX","MAXIM","MAXIMUM","MIX","MUM"],"placed":[{"word":"MAXIMUM","r":2,"c":0,"d":"A"},{"word":"MAXIM","r":2,"c":0,"d":"A"},{"word":"IMAM","r":2,"c":3,"d":"D"},{"word":"MAIM","r":0,"c":3,"d":"D"},{"word":"MUM","r":2,"c":4,"d":"A"},{"word":"MAX","r":2,"c":0,"d":"A"},{"word":"MIX","r":2,"c":0,"d":"D"},{"word":"AIM","r":1,"c":3,"d":"D"}],"h":6,"w":7}];

let st={idx:0,lv:null,found:new Set(),path:[],hints:3,shuffleSeed:0,lap:0};

// FIX (CROSSWORD-SOFT-LOCK-ON-REPLAY): mood.wc.found.<idx> — the set of
// words already discovered for a given puzzle — was written on every find
// but never once cleared anywhere in this file. That's invisible for your
// first pass through the 45 puzzles, but the moment "Next" wraps from
// puzzle 45 back to puzzle 1 (exactly what makes this endless instead of a
// one-and-done set), puzzle 1 loads with every word already marked found
// from the first lap. markFound() only fires levelComplete() when a *new*
// word is found (`if(st.found.has(word))return;`), and there's no other way
// to reach the "complete" overlay — so a puzzle that loads pre-solved has
// no way to ever re-trigger completion. The player is stuck on a fully-
// solved board with no visible way to move on. This is why "endless
// crossword" didn't actually work past the first 45 puzzles.
function loadProgress(){
 const saved=+(localStorage.getItem('mood.wc.level')||0);
 st.idx=Math.min(Math.max(0,saved),WC_LEVELS.length-1);
 st.hints=+(localStorage.getItem('mood.wc.hints')||3);
 st.lap=+(localStorage.getItem('mood.wc.lap')||0);
}
function saveProgress(){
 localStorage.setItem('mood.wc.level',String(st.idx));
 localStorage.setItem('mood.wc.hints',String(st.hints));
 localStorage.setItem('mood.wc.lap',String(st.lap));
}
// Cumulative, ever-climbing level number for display (LEVEL 46, 47… instead
// of resetting to LEVEL 1 every 45 puzzles) — this is what "reached level
// 100, come back later, still at level 100" should actually show.
function wcEndlessLevel(){return st.lap*WC_LEVELS.length+st.idx+1}
function coins(delta){
 try{
  if(window.data&&typeof window.data==='object'){
   window.data.coins=(window.data.coins||0)+delta;
   if(typeof window.save==='function')window.save();
   const el=document.getElementById('coins');if(el)el.textContent=window.data.coins.toLocaleString();
   const el2=document.getElementById('tc');if(el2)el2.textContent=window.data.coins.toLocaleString();
   return window.data.coins;
  }
 }catch(e){}
 const k='mood.wc.coins';let c=+(localStorage.getItem(k)||1200)+delta;localStorage.setItem(k,String(c));return c;
}
function getCoins(){
 try{if(window.data&&typeof window.data.coins==='number')return window.data.coins}catch(e){}
 return +(localStorage.getItem('mood.wc.coins')||1200);
}

function cellKey(r,c){return r+':'+c}

function buildCellMap(lv){
 // map every cell covered by any placed word -> letter, plus which words (indices) touch it
 const map={};
 lv.placed.forEach((p,wi)=>{
  for(let i=0;i<p.word.length;i++){
   const rr=p.r+(p.d==='D'?i:0), cc=p.c+(p.d==='A'?i:0);
   const k=cellKey(rr,cc);
   if(!map[k])map[k]={ch:p.word[i],words:[]};
   map[k].words.push(wi);
  }
 });
 return map;
}

function toast(t){
 const e=document.getElementById('wcToast');if(!e)return;
 e.textContent=t;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),1500);
}

function render(){
 const sec=document.getElementById('crossword');
 if(!sec)return;
 loadProgress();
 const room=window.__gameRoomMatch;
 if(room?.gameType==='crossword'&&room.level){st.idx=(Math.max(1,Number(room.level))-1)%WC_LEVELS.length;st.lap=Math.floor((Math.max(1,Number(room.level))-1)/WC_LEVELS.length);}
 st.lv=WC_LEVELS[st.idx];
 st.found=new Set(JSON.parse(localStorage.getItem('mood.wc.found.'+st.idx)||'[]'));
 // FIX (CROSSWORD-SOFT-LOCK-ON-REPLAY): a puzzle loading already 100% found
 // can only mean we're replaying it on a later lap (there's no legitimate
 // way to reach it pre-solved otherwise) — clear it so it's playable again
 // instead of a permanently-solved dead end with no way to advance.
 if(st.lv&&st.found.size>=st.lv.words.length){
  st.found=new Set();
  localStorage.removeItem('mood.wc.found.'+st.idx);
 }
 st.path=[];
 if(st.hintsFor!==st.idx+':'+st.lap){st.hintsFor=st.idx+':'+st.lap;st.hintsUsed=0}
 sec.innerHTML = '<div class="wc-wrap">'+
  '<div class="wc-top">'+
   '<button class="icon" id="wcBack">\u2039</button>'+
   '<div class="wc-level">LEVEL <b id="levelNum"></b></div>'+
   '<div class="wc-found" id="wcFoundCount"></div>'+
   '<div class="coins">\ud83e\ude99 <span id="wcCoinsDisp"></span></div>'+
  '</div>'+
  '<div class="wc-progress"><i id="wcProgFill"></i></div>'+
  '<div class="wc-boardwrap"><div class="wc-board" id="wcBoard"></div></div>'+
  '<div class="wc-current" id="wcCurrent">&nbsp;</div>'+
  '<div class="wc-toolbar">'+
   '<button class="wc-tool" id="wcWordsBtn">\ud83d\udcd6<small id="wcWordsSub">Words</small></button>'+
   '<button class="wc-tool" id="wcHintBtn">\ud83d\udca1<small>Hint</small></button>'+
   '<button class="wc-tool" id="wcShuffleBtn">\ud83d\udd00<small>Shuffle</small></button>'+
  '</div>'+
  '<div class="wc-wheelwrap" id="wcWheelWrap">'+
   '<svg id="wcLines" class="wc-lines"></svg>'+
   '<div id="wcWheel" class="wc-wheel"></div>'+
  '</div>'+
 '</div>'+
 '<div id="wcWordsOverlay" class="overlay"><div class="modal wc-words-modal">'+
  '<h2>Words in this puzzle</h2>'+
  '<div class="wc-wordlist" id="wcWordList"></div>'+
  '<div class="row"><button class="primary" id="wcWordsClose">Close</button></div>'+
 '</div></div>'+
 '<div id="wcWordsCostOverlay" class="overlay"><div class="modal"><div class="big">\ud83d\udcd6</div><h2>Open word list</h2><p>You used your 2 free opens today.<br>Opening it again costs <b>50 coins</b>.</p><div class="row"><button id="wcWordsCostNo">Cancel</button><button class="primary" id="wcWordsCostYes">Pay 50 coins</button></div></div></div>'+
 '<div id="wcToast" class="toast"></div>';

 document.getElementById('wcBack').onclick=()=>{ if(typeof window.home==='function')window.home(); };
 document.getElementById('wcWordsBtn').onclick=openWords;
 document.getElementById('wcWordsCostNo').onclick=()=>document.getElementById('wcWordsCostOverlay').classList.remove('show');
 document.getElementById('wcWordsCostYes').onclick=payForWords;
 updateWordsBadge();
 window.addEventListener('necpra:coins-changed',()=>{const el=document.getElementById('wcCoinsDisp');if(el)el.textContent=getCoins().toLocaleString()});
 document.getElementById('wcWordsClose').onclick=()=>document.getElementById('wcWordsOverlay').classList.remove('show');
 document.getElementById('wcHintBtn').onclick=useHint;
 document.getElementById('wcShuffleBtn').onclick=shuffleWheel;

 renderBoard();
 renderWheel();
 renderWordList();
 updateHud();
 bindWheelEvents();
}

function renderBoard(){
 const lv=st.lv, board=document.getElementById('wcBoard');
 const cellMap=buildCellMap(lv);
 st.cellMap=cellMap;
 board.style.gridTemplateColumns='repeat('+lv.w+',1fr)';
 board.style.gridTemplateRows='repeat('+lv.h+',1fr)';
 board.innerHTML='';
 // does at least one placed word using this cell already have all its letters found? reveal fully.
 // otherwise reveal only if some found word passes through this cell.
 for(let r=0;r<lv.h;r++){
  for(let c=0;c<lv.w;c++){
   const k=cellKey(r,c), info=cellMap[k];
   const cell=document.createElement('div');
   if(!info){ cell.className='wc-cell wc-blank'; board.appendChild(cell); continue; }
   cell.className='wc-cell wc-open';
   cell.dataset.k=k;
   const span=document.createElement('span');
   cell.appendChild(span);
   board.appendChild(cell);
  }
 }
 paintFound();
}

function paintFound(){
 const lv=st.lv;
 lv.placed.forEach((p,wi)=>{
  const isFound=st.found.has(p.word);
  for(let i=0;i<p.word.length;i++){
   const rr=p.r+(p.d==='D'?i:0), cc=p.c+(p.d==='A'?i:0);
   const cell=document.querySelector('.wc-cell[data-k="'+cellKey(rr,cc)+'"]');
   if(!cell)continue;
   if(isFound){
    cell.classList.add('wc-filled');
    cell.querySelector('span').textContent=p.word[i];
   }
  }
 });
}


// ── Word list access: 2 free opens per DAY (any level), then 50 coins per open ──
const WC_WORDS_FREE=2,WC_WORDS_COST=50;
function wcUid(){
 try{const a=JSON.parse(localStorage.getItem('kynecta_auth')||'null');const u=a&&((a.user&&a.user.id)||a.userId||a.id);if(u)return String(u)}catch(e){}
 try{return String(window.__CURRENT_USER_ID__||localStorage.getItem('userId')||localStorage.getItem('user_id')||'anon')}catch(e){return 'anon'}
}
function wcDay(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function wcWordsKey(){return 'mood.wc.wordsOpens.'+wcUid()+'.'+wcDay()}
function wcWordsUsed(){return +(localStorage.getItem(wcWordsKey())||0)}
function updateWordsBadge(){
 const e=document.getElementById('wcWordsSub');if(!e)return;
 const left=Math.max(0,WC_WORDS_FREE-wcWordsUsed());
 e.textContent=left>0?('Words \u00b7 '+left+' free'):('Words \u00b7 '+WC_WORDS_COST+'\ud83e\ude99');
}
function showWordsModal(){renderWordList();document.getElementById('wcWordsOverlay').classList.add('show')}
async function wcSpend(n){
 if(typeof window.__spendGameCoins==='function')return await window.__spendGameCoins(n,'crossword-words');
 if(getCoins()<n)return false;coins(-n);return true;
}
function openWords(){
 const used=wcWordsUsed();
 if(used<WC_WORDS_FREE){
  localStorage.setItem(wcWordsKey(),String(used+1));updateWordsBadge();
  toast('Free opens left today: '+(WC_WORDS_FREE-used-1));showWordsModal();return;
 }
 if(getCoins()<WC_WORDS_COST){
  toast('Not enough coins \u2014 you need '+WC_WORDS_COST);
  if(typeof window.__buyGameCoins==='function')window.__buyGameCoins();
  return;
 }
 document.getElementById('wcWordsCostOverlay').classList.add('show');
}
async function payForWords(){
 document.getElementById('wcWordsCostOverlay').classList.remove('show');
 const ok=await wcSpend(WC_WORDS_COST);
 if(!ok){toast('Not enough coins');if(typeof window.__buyGameCoins==='function')window.__buyGameCoins();return}
 try{updateHud()}catch(e){}
 const el=document.getElementById('wcCoinsDisp');if(el)el.textContent=getCoins().toLocaleString();
 toast('-'+WC_WORDS_COST+' coins');showWordsModal();
}

function renderWordList(){
 const wrap=document.getElementById('wcWordList');
 if(!wrap)return;
 wrap.innerHTML='';
 st.lv.words.forEach(w=>{
  const row=document.createElement('div');
  row.className='wc-wrow'+(st.found.has(w)?' found':'');
  row.innerHTML='<span class="wc-wlen">'+w.length+'</span><span class="wc-wtext">'+w+'</span>';
  wrap.appendChild(row);
 });
}

function updateHud(){
 document.getElementById('levelNum').textContent=wcEndlessLevel();
 document.getElementById('wcCoinsDisp').textContent=getCoins().toLocaleString();
 document.getElementById('wcFoundCount').textContent=st.found.size+'/'+st.lv.words.length;
 document.getElementById('wcProgFill').style.width=(st.found.size/st.lv.words.length*100)+'%';
}

let wheelOrder=[];
function renderWheel(){
 const lv=st.lv, wheel=document.getElementById('wcWheel');
 if(!wheel||!lv||!lv.letters)return; // not built yet (e.g. resize fired before render())
 wheel.innerHTML='';
 if(!wheelOrder.length || wheelOrder.length!==lv.letters.length || st._wheelForIdx!==st.idx){
  wheelOrder=lv.letters.map((ch,i)=>({ch,i})); st._wheelForIdx=st.idx;
 }
 const n=wheelOrder.length;
 const wrapEl=document.getElementById('wcWheelWrap');
 const size=Math.min(wrapEl.clientWidth||300, 300);
 const bubble=Math.max(46,Math.min(58, size/n*1.15));
 const radius=size/2 - bubble/2 - 6;
 wheelOrder.forEach((item,pos)=>{
  const ang=(Math.PI*2*pos/n) - Math.PI/2;
  const x=size/2 + radius*Math.cos(ang) - bubble/2;
  const y=size/2 + radius*Math.sin(ang) - bubble/2;
  const el=document.createElement('div');
  el.className='wc-letter';
  el.style.width=bubble+'px';el.style.height=bubble+'px';
  el.style.left=x+'px';el.style.top=y+'px';
  el.style.fontSize=(bubble*0.42)+'px';
  el.textContent=item.ch.toUpperCase();
  el.dataset.pos=pos;
  el.dataset.letter=item.ch.toUpperCase();
  wheel.appendChild(el);
 });
}

function shuffleWheel(){
 for(let i=wheelOrder.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [wheelOrder[i],wheelOrder[j]]=[wheelOrder[j],wheelOrder[i]];
 }
 renderWheel();
}

function useHint(){
 if(st.hints<=0){toast('No hints left — earn more by completing levels');return;}
 const remaining=st.lv.words.filter(w=>!st.found.has(w));
 if(!remaining.length){toast('All words already found!');return;}
 remaining.sort((a,b)=>a.length-b.length);
 const w=remaining[0];
 st.hints--; st.hintsUsed=(st.hintsUsed||0)+1; saveProgress();
 const cur=document.getElementById('wcCurrent');
 if(cur){cur.innerHTML='<span class="wc-hint-prefix">FORM&nbsp;</span><b>'+w+'</b>';clearTimeout(cur._hintTimer);cur._hintTimer=setTimeout(()=>{if(!st.path.length)cur.innerHTML='&nbsp;'},3000)}
 toast('HINT: form "'+w+'"');beep(680,.08);
}

function markFound(word,silent){
 if(st.found.has(word))return;
 st.found.add(word);
 localStorage.setItem('mood.wc.found.'+st.idx, JSON.stringify([...st.found]));
 paintFound();
 renderWordList();
 updateHud();
 const gain=10*word.length;
 coins(gain);
 window.__gameRoomState?.({answered:st.found.size,correct:st.found.size,score:st.found.size*10,progress:Math.round(st.found.size/st.lv.words.length*100),currentLevel:wcEndlessLevel(),timeMs:window.__gameRoomMatch?.state?.matchStartedAt?Math.max(0,Date.now()-new Date(window.__gameRoomMatch.state.matchStartedAt).getTime()):0});
 if(!silent){
  toast('+'+gain+' \ud83e\ude99  '+word);
  burstAt(word);
 }
 if(st.found.size>=st.lv.words.length){
  setTimeout(levelComplete,450);
 }
}

function burstAt(word){
 try{
  const cells=[...document.querySelectorAll('.wc-cell.wc-filled')];
  const board=document.getElementById('wcBoard');
  board.animate([{filter:'brightness(1)'},{filter:'brightness(1.4)'},{filter:'brightness(1)'}],{duration:380});
 }catch(e){}
}

function levelComplete(){
 // FIX (CROSSWORD-HINTS-NEVER-REPLENISH): hints are earned back by completing levels (capped at 5).
 st.hints=Math.min(5,st.hints+1);
 // Small escalating reward for playing past lap 1.
 const bonus=250+st.lap*50;
 coins(bonus);
 const room=window.__gameRoomMatch;
 const doneIdx=st.idx,doneLap=st.lap,doneLevel=wcEndlessLevel(),used=st.hintsUsed||0,words=st.found.size;
 // Advance on COMPLETION (not on the Next click) so Quit from the card still resumes at the next level;
 // Replay puts the completed level back. Live rooms never move saved solo progress.
 if(!room){
  if(st.idx+1>=WC_LEVELS.length)st.lap++;
  st.idx=(st.idx+1)%WC_LEVELS.length;
 }
 saveProgress();
 if(window.__gameRoomComplete)window.__gameRoomComplete(words*10+bonus,{timeMs:room?.state?.matchStartedAt?Math.max(0,Date.now()-new Date(room.state.matchStartedAt).getTime()):0,answered:words,correct:words});
 try{
  if(window.data){ window.data.best=Math.max(window.data.best||0, words); window.data.streak=(window.data.streak||0)+1; if(typeof window.save==='function')window.save(); }
 }catch(e){}
 const ratio=used===0?1:used===1?.9:used===2?.8:used===3?.65:.5;
 const card={level:doneLevel,ratio,stars:ratio>=.9?3:ratio>=.65?2:1,
  rows:[['Words found',String(words)],['Hints used',String(used)],['Bonus','+'+bonus+' coins, +1 hint']],
  onNext:()=>render(),
  onReplay:()=>{
   if(!room){st.idx=doneIdx;st.lap=doneLap;saveProgress();}
   localStorage.removeItem('mood.wc.found.'+doneIdx);
   st.hintsFor=null;
   render();
  }};
 if(typeof window.necpraLevelDone==='function')window.necpraLevelDone(card);
 else render();
}

// ---- Wheel drag / swipe-to-connect input ----
function clearPath(){
 st.path=[];
 document.querySelectorAll('.wc-letter.active').forEach(e=>e.classList.remove('active'));
 const svg=document.getElementById('wcLines'); if(svg)svg.innerHTML='';
 st.tap=false;
 const cur=document.getElementById('wcCurrent'); if(cur){cur.innerHTML='&nbsp;';cur.classList.remove('ok','bad');}
}

function pathWord(){return st.path.map(e=>e.dataset.letter).join('');}
function setLabelState(state){const c=document.getElementById('wcCurrent');if(!c)return;c.classList.remove('ok','bad');if(state)c.classList.add(state);}
function shakeWheel(){const w=document.getElementById('wcWheel');if(w)w.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}],{duration:250});}
// Show a word that did not match in red for a moment (used after swipe submit)
function showWrongWord(word){
 const c=document.getElementById('wcCurrent');if(!c)return;
 c.textContent=word;setLabelState('bad');
 setTimeout(()=>{if(!st.path.length&&c.textContent===word){c.innerHTML='&nbsp;';setLabelState(null);}},800);
}
// Tap mode: player taps letters one by one (P, then O, then L => "POL").
// The word is shown live; green while it can still become a puzzle word, red when it cannot.
// When it completes a puzzle word the boxes on the board are filled in.
function liveCheck(){
 const word=pathWord();
 updateCurrentLabel();
 const unfound=st.lv.words.filter(w=>!st.found.has(w));
 if(unfound.includes(word)){
  setLabelState('ok');
  markFound(word,false);
  setTimeout(()=>{if(pathWord()===word)clearPath();},450);
  return;
 }
 if(unfound.some(w=>w.startsWith(word))){setLabelState('ok');return;}
 if(st.found.has(word)){
  setLabelState('bad');toast('Already found');
  setTimeout(()=>{if(pathWord()===word)clearPath();},700);
  return;
 }
 setLabelState('bad');
 toast(word+' \u2717 not in this puzzle');
 shakeWheel();
 setTimeout(()=>{if(pathWord()===word)clearPath();},800);
}

function updateCurrentLabel(){
 const cur=document.getElementById('wcCurrent');
 if(!cur)return;
 cur.textContent = st.path.map(e=>e.dataset.letter).join('') || '\u00a0';
}

function drawLines(extra){
 const svg=document.getElementById('wcLines');
 const wrap=document.getElementById('wcWheelWrap');
 if(!svg||!wrap)return;
 const r=wrap.getBoundingClientRect();
 svg.setAttribute('viewBox','0 0 '+r.width+' '+r.height);
 let d='';
 const pts=st.path.map(e=>{
  const b=e.getBoundingClientRect();
  return [b.left-r.left+b.width/2, b.top-r.top+b.height/2];
 });
 if(extra) pts.push(extra);
 svg.innerHTML='';
 if(pts.length>1){
  let dstr='M'+pts[0][0]+','+pts[0][1];
  for(let i=1;i<pts.length;i++)dstr+=' L'+pts[i][0]+','+pts[i][1];
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',dstr);
  path.setAttribute('class','wc-traceline');
  svg.appendChild(path);
 }
}

function elFromPoint(x,y){
 const els=document.elementsFromPoint(x,y);
 return els.find(e=>e.classList&&e.classList.contains('wc-letter'));
}

function tryAdd(el){
 if(!el)return;
 const last=st.path[st.path.length-1];
 if(last===el)return;
 const prev=st.path[st.path.length-2];
 if(prev===el){ // backtrack
  last.classList.remove('active');
  st.path.pop();
  updateCurrentLabel(); drawLines();
  return;
 }
 if(st.path.includes(el))return;
 el.classList.add('active');
 st.path.push(el);
 updateCurrentLabel(); drawLines();
}

function submitPath(){
 const word=st.path.map(e=>e.dataset.letter).join('');
 if(word.length>=3){
  if(st.lv.words.includes(word) && !st.found.has(word)){
   markFound(word,false);
  } else if(st.found.has(word)){
   toast('Already found');
  } else {
   toast(word+' isn\u2019t in this puzzle');
   shakeWheel();
   clearPath();
   showWrongWord(word);
   return;
  }
 }
 clearPath();
}

let dragging=false,moved=false,downEl=null;
function bindWheelEvents(){
 const wheel=document.getElementById('wcWheel');
 if(!wheel||wheel._wcBound)return;
 wheel._wcBound=true;
 wheel.addEventListener('pointerdown',e=>{
  const el=elFromPoint(e.clientX,e.clientY);
  if(!el)return;
  dragging=true;moved=false;downEl=el;
  if(!st.tap)clearPath();   // in tap mode keep the letters already tapped
  tryAdd(el);
  e.preventDefault();
 });
 window.addEventListener('pointermove',e=>{
  if(!dragging)return;
  const el=elFromPoint(e.clientX,e.clientY);
  if(el&&el!==downEl&&!moved){
   moved=true;
   if(st.tap){clearPath();tryAdd(downEl);}   // dragging starts a fresh swipe
  }
  if(el) tryAdd(el);
  else {
   const wrap=document.getElementById('wcWheelWrap');
   if(wrap){const r=wrap.getBoundingClientRect();drawLines([e.clientX-r.left,e.clientY-r.top]);}
  }
 });
 window.addEventListener('pointerup',()=>{
  if(!dragging)return;
  dragging=false;
  if(!moved){st.tap=true;liveCheck();}   // simple tap -> tap mode
  else submitPath();
 });
 // tapping the word bar clears the current selection
 const cur=document.getElementById('wcCurrent');
 if(cur&&!cur._wcClr){cur._wcClr=true;cur.style.cursor='pointer';cur.addEventListener('click',()=>{if(st.path.length)clearPath();});}
}

window.addEventListener('resize',()=>{ const c=document.getElementById('crossword'); if(c&&c.classList.contains('active')&&document.getElementById('wcWheel')) renderWheel(); });

const style=document.createElement('style');
style.textContent=`
.wc-wrap{height:100%;display:flex;flex-direction:column;background:radial-gradient(circle at 50% 18%,#69d8ee12,transparent 35%);color:var(--kyn-text-primary)}
.wc-top{height:54px;flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:0 12px}
.wc-top .icon{width:38px;height:38px;font-size:20px}
.wc-level{font-weight:900;font-size:13px;letter-spacing:1px;color:var(--kyn-text-secondary)}
.wc-level b{color:var(--kyn-text-primary);font-size:15px}
.wc-found{flex:1;text-align:center;font-weight:900;font-size:12px;color:var(--kyn-accent-info)}
.wc-progress{height:5px;margin:2px 12px 6px;border-radius:8px;background:var(--g-surface-hi);overflow:hidden;flex:0 0 auto}
.wc-progress i{display:block;height:100%;width:0;background:linear-gradient(90deg,var(--kyn-accent-purple),var(--kyn-accent-info));transition:.3s}
.wc-boardwrap{flex:1 1 auto;min-height:0;container-type:size;display:flex;align-items:center;justify-content:center;padding:6px 10px;overflow:hidden}
.wc-board{display:grid;gap:3px;width:min(94vw,420px,calc(100cqh*var(--ar,1)));aspect-ratio:var(--ar,1);margin:auto}
.wc-cell{position:relative;border-radius:5px}
.wc-cell.wc-blank{background:transparent}
.wc-cell.wc-open{background:color-mix(in srgb,var(--kyn-text-primary) 10%,transparent);border:1.5px solid var(--kyn-border)}
.wc-cell.wc-filled{background:linear-gradient(145deg,#7c6cff,#4d7cf2);border:1.5px solid #b9c4ffaa;box-shadow:inset 0 2px color-mix(in srgb,#fff 25%,transparent)}
.wc-cell span{position:absolute;inset:0;display:grid;place-items:center;font-weight:1000;font-size:clamp(11px,3.4vw,18px);color:var(--kyn-text-primary)}
.wc-cell.wc-filled span{color:#fff}
.wc-current{flex:0 0 auto;text-align:center;min-height:40px;line-height:40px;font-size:22px;font-weight:1000;letter-spacing:3px;color:var(--kyn-accent-warning);text-shadow:0 2px 10px color-mix(in srgb,var(--kyn-bg-root) 60%,transparent)}.wc-current .wc-hint-prefix{font-size:11px;letter-spacing:1px;opacity:.72;margin-right:5px}.wc-current b{letter-spacing:4px}
.wc-toolbar{flex:0 0 auto;display:flex;justify-content:center;gap:20px;padding:2px 12px 6px}
.wc-tool{width:56px;height:56px;border-radius:18px;background:var(--g-surface);border:1px solid var(--g-line);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:20px}
.wc-tool small{font-size:8px;color:var(--kyn-text-secondary);font-weight:900;text-transform:uppercase}
.wc-wheelwrap{position:relative;flex:0 0 auto;width:min(92vw,300px);height:min(92vw,300px);margin:4px auto 14px}
.wc-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.wc-current.ok{color:#22c55e}.wc-current.bad{color:#ef4444}
.wc-traceline{fill:none;stroke:var(--kyn-accent-purple);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
.wc-wheel{position:absolute;inset:0;touch-action:none}
.wc-letter{position:absolute;border-radius:50%;display:grid;place-items:center;font-weight:1000;background:var(--kyn-bg-card);border:2px solid var(--kyn-border-strong);box-shadow:var(--kyn-shadow-sm);user-select:none;transition:transform .08s,background .12s,border-color .12s}
.wc-letter.active{background:linear-gradient(135deg,var(--kyn-accent-purple),var(--kyn-accent-info));color:#fff;border-color:transparent;transform:scale(1.12);box-shadow:0 0 18px color-mix(in srgb,var(--kyn-accent-purple) 60%,transparent)}
.wc-words-modal{max-height:80vh;display:flex;flex-direction:column}
.wc-wordlist{overflow:auto;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:10px 0}
.wc-wrow{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:var(--g-surface);font-weight:900;letter-spacing:2px;font-size:13px}
.wc-wrow.found{background:color-mix(in srgb,var(--kyn-accent-primary) 20%,var(--g-surface));color:var(--kyn-accent-primary)}
.wc-wlen{width:20px;height:20px;border-radius:50%;background:var(--g-surface-hi);display:grid;place-items:center;font-size:10px;flex:0 0 auto}
`;
document.head.appendChild(style);

function setAspect(){
 const b=document.getElementById('wcBoard');
 if(b&&st.lv)b.style.setProperty('--ar', (st.lv.w/st.lv.h));
}

function init(){
 const sec=document.getElementById('crossword');
 window.__MOOD_CROSSWORD_OPEN__=()=>{setTimeout(()=>{try{render();setAspect()}catch(e){console.error('Crossword render failed',e);}},20)};
 if(!sec)return;
 const old=window.openGame;
 if(typeof old==='function'&&!window.__wcOpenWrapped){
  window.__wcOpenWrapped=true;
  window.openGame=function(type){
   const r=old.apply(this,arguments);
   if(type==='crossword')setTimeout(()=>{render();setAspect();},60);
   return r;
  };
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
