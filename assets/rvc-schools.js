/* Character references are separate from installed voice models. */
(() => {
  const schools = [
    { id: "abydos", name: "阿拜多斯高等学校", en: "Abydos High School", tag: "阿拜多斯",
      source: "https://www.bluearchive.jp/kivotostest/abydos/1/result",
      students: [
        ["shiroko", "砂狼白子", "シロコ", "Shiroko"],
        ["hoshino", "小鸟游星野", "ホシノ", "Hoshino"],
        ["nonomi", "十六夜野乃美", "ノノミ", "Nonomi"],
        ["serika", "黑见芹香", "セリカ", "Serika"],
        ["ayane", "奥空绫音", "アヤネ", "Ayane"],
      ] },
    { id: "highlander", name: "高地人铁道学院", en: "Highlander Railroad Academy", tag: "高地人",
      source: "https://www.tanita.co.jp/content/bluearchive/",
      students: [
        ["hikari", "橘光", "橘ヒカリ", "Hikari"],
        ["nozomi", "橘望", "橘ノゾミ", "Nozomi"],
        ["aoba", "内海青叶", "内海アオバ", "Aoba"],
        ["suou", "朝雾苏芳", "朝霧スオウ", "Suou"],
      ] },
    { id: "odyssey", name: "奥德赛（奥德修斯）海洋学院", en: "Odyssey Maritime School", tag: "奥德赛", alias: "奥德修斯",
      source: "https://gamewith.jp/gamedb/6253/articles/62411",
      students: [
        ["toumi-kokoro", "渡海心", "渡海ココロ", "Toumi Kokoro"],
        ["fuchigami-kotone", "渊上琴音", "淵上コトネ", "Fuchigami Kotone"],
      ] },
    { id: "wildhunt", name: "狂猎艺术学院", en: "Wild Hunt Academy of Arts", tag: "狂猎",
      source: "https://game8.jp/blue-archive/711367",
      students: [
        ["eri", "エリ", "エリ", "Eri"],
        ["kanoe", "カノエ", "カノエ", "Kanoe"],
        ["miyo", "ミヨ", "ミヨ", "Miyo"],
        ["fuyu", "フユ", "フユ", "Fuyu"],
        ["ritsu", "リツ", "リツ", "Ritsu"],
        ["rena", "レナ", "レナ", "Rena"],
        ["tsumugi", "ツムギ", "ツムギ", "Tsumugi"],
      ] },
  ];
  const trinityStudents = [
    ['hifumi','阿慈谷日富美','ヒフミ','Hifumi'],['azusa','白洲梓','アズサ','Azusa'],
    ['hanako','浦和花子','ハナコ','Hanako'],['koharu','下江小春','コハル','Koharu'],
    ['nagisa','桐藤渚','ナギサ','Nagisa'],['mika','圣园未花','ミカ','Mika'],['seia','百合园圣娅','セイア','Seia'],
    ['tsurugi','剑先鹤城','ツルギ','Tsurugi'],['hasumi','羽川莲见','ハスミ','Hasumi'],
    ['mashiro','静山真白','マシロ','Mashiro'],['ichika','仲正一花','イチカ','Ichika'],
    ['mari','伊落玛丽','マリー','Mari'],['hinata','若叶日向','ヒナタ','Hinata'],['sakurako','歌住樱子','サクラコ','Sakurako'],
    ['mine','苍森美祢','ミネ','Mine'],['hanae','朝颜花江','ハナエ','Hanae'],['serina','鹫见芹娜','セリナ','Serina'],
    ['airi','栗村爱莉','アイリ','Airi'],['yoshimi','伊原木好美','ヨシミ','Yoshimi'],
    ['kazusa','杏山和纱','カズサ','Kazusa'],['natsu','柚鸟夏','ナツ','Natsu'],
    ['ui','古关忧','ウイ','Ui'],['shimiko','圆堂志美子','シミコ','Shimiko'],
    ['suzumi','守月铃美','スズミ','Suzumi'],['reisa','宇泽玲纱','レイサ','Reisa'],
    ['love','拉布','ラブ','Love'],
  ];
  // Character references remain visible even where a voice is unavailable.
  const installedSchools = [
    ["millennium", "千年科学学园", "Millennium Science School", "千年"],
    ["gehenna", "格黑娜学园", "Gehenna Academy", "格黑娜"],
    ["trinity", "三一综合学园", "Trinity General School", "三一", "圣三一"],
    ["shittim", "什亭之匣（其他）", "Shittim Chest (Other)", "什亭之匣"],
  ];
  for (const [id, name, en, tag, alias] of installedSchools) {
    schools.push({ id, name, en, tag, alias, students: id==='trinity'?trinityStudents:[],
      source: id==='trinity'?"https://www.tanita.co.jp/content/bluearchive/":"assets/rvc-models.json" });
  }
  function syncCatalog(models) {
    if (!Array.isArray(models)) return;
    for (const school of schools.filter(item => installedSchools.some(([id]) => id === item.id))) {
      const installed=models.filter(model => model && (model.tags || []).some(tag => tag === school.tag || tag === school.alias));
      school.students = school.id==='trinity'
        ? [...trinityStudents,...installed.filter(model=>!trinityStudents.some(student=>student[0]===model.id)).map(model=>[model.id,model.name,'',model.id])]
        : installed.map(model => [model.id, model.name, "", model.id]);
    }
  }
  function schoolFor(model) {
    if (!model) return "";
    return schools.find(school => school.students.some(student => student[0] === model.id)
      || (model.tags || []).some(tag => tag === school.tag || tag === school.alias))?.id || "";
  }
  window.PostPrepSchools = Object.freeze({ schools, schoolFor, syncCatalog });
})();
