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
  // Restore schools from the installed catalog; these rows do not imply new models.
  const installedSchools = [
    ["millennium", "千年科学学园", "Millennium Science School", "千年"],
    ["gehenna", "格黑娜学园", "Gehenna Academy", "格黑娜"],
    ["trinity", "三一综合学园", "Trinity General School", "三一", "圣三一"],
    ["shittim", "什亭之匣（其他）", "Shittim Chest (Other)", "什亭之匣"],
  ];
  for (const [id, name, en, tag, alias] of installedSchools) {
    schools.push({ id, name, en, tag, alias, students: [], source: "assets/rvc-models.json" });
  }
  function syncCatalog(models) {
    for (const school of schools.filter(item => installedSchools.some(([id]) => id === item.id))) {
      school.students = models.filter(model => (model.tags || []).some(tag => tag === school.tag || tag === school.alias))
        .map(model => [model.id, model.name, "", model.id]);
    }
  }
  function schoolFor(model) {
    return schools.find(school => school.students.some(student => student[0] === model.id)
      || (model.tags || []).some(tag => tag === school.tag || tag === school.alias))?.id || "";
  }
  window.PostPrepSchools = Object.freeze({ schools, schoolFor, syncCatalog });
})();
