import fs from "fs";
import path from "path";

const configPath = path.join(
  "C:/Users/WDAGUtilityAccount/Desktop/HwHxBOT/assets/json-data/database-config.json"
);

// Lấy config mới nhất
export function getDBConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

// Lưu config
export function setDBConfig(newConfig) {
  fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), "utf8");
}
