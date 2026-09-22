// A small reader for the `INSERT INTO \`table\` VALUES (...),(...);` lines of
// a MySQL dump, as the CMaNGOS database ships them. Yields one row (array of
// values) at a time, with quoted strings unescaped and numbers parsed.

export function* readInsertRows(sql, table) {
  const prefix = "INSERT INTO `" + table + "` ";
  let pos = 0;
  while ((pos = sql.indexOf(prefix, pos)) !== -1) {
    let i = sql.indexOf("VALUES", pos) + 6;
    // walk tuples until the terminating semicolon
    for (;;) {
      while (i < sql.length && (sql[i] === " " || sql[i] === "," || sql[i] === "\n" || sql[i] === "\r")) i++;
      if (sql[i] !== "(") break;
      i++;
      const row = [];
      for (;;) {
        while (sql[i] === " ") i++;
        if (sql[i] === "'") {
          let s = "";
          i++;
          for (;;) {
            const c = sql[i];
            if (c === "\\") { const n = sql[i + 1]; s += n === "n" ? "\n" : n === "r" ? "\r" : n === "0" ? "\0" : n; i += 2; continue; }
            if (c === "'") { if (sql[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; }
            s += c; i++;
          }
          row.push(s);
        } else {
          let j = i;
          while (sql[j] !== "," && sql[j] !== ")") j++;
          const raw = sql.slice(i, j).trim();
          row.push(raw === "NULL" ? null : Number(raw));
          i = j;
        }
        if (sql[i] === ",") { i++; continue; }
        if (sql[i] === ")") { i++; break; }
      }
      yield row;
    }
    pos = i;
  }
}

// Column names from the CREATE TABLE statement, so rows can be read by name.
export function tableColumns(sql, table) {
  const start = sql.indexOf("CREATE TABLE `" + table + "` (");
  if (start === -1) throw new Error("no CREATE TABLE for " + table);
  const end = sql.indexOf("\n)", start);
  return [...sql.slice(start, end).matchAll(/^\s+`([^`]+)`/gm)].map((m) => m[1]);
}
