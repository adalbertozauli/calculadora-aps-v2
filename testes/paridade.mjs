// Teste de paridade: confere que a 2.0 calcula, valida e copia EXATAMENTE como a versão 1.
// Uso:  node testes/paridade.mjs
// Roda as funções atualizarIG/TFG/Dose/IMC das duas versões com milhares de entradas
// (casos do README + valores aleatórios e inválidos) e compara texto copiado, avisos e alertas.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const pasta = new URL("..", import.meta.url);
const v1 = readFileSync(new URL("testes/referencia-v1.html", pasta), "utf8");
const v2 = readFileSync(new URL("calculadora-aps.html", pasta), "utf8");

function bloco(html, id) {
  const m = html.match(new RegExp('\n<script id="' + id + '">([\\s\\S]*?)</script>'));
  if (!m) throw new Error("bloco " + id + " não encontrado");
  return m[1];
}

// Carrega uma versão num ambiente com um "document" mínimo (só os campos)
function carregar(html, hojeFixo) {
  const campos = {};
  const ctx = {
    campos, modo: "dum",
    console,
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      getElementById: (id) => {
        if (!(id in campos)) campos[id] = { value: "", hidden: false };
        return campos[id];
      },
      querySelector: () => ({ value: ctx.modo })
    }
  };
  ctx.Date = class extends Date {
    constructor(...a) { if (a.length === 0) super(hojeFixo); else super(...a); }
  };
  vm.createContext(ctx);
  const calculos = bloco(html, "calculos");
  const interfaceTexto = bloco(html, "interface");
  const soFuncoes = interfaceTexto.slice(0, interfaceTexto.indexOf("const CALCULADORAS"));
  vm.runInContext(calculos + "\n" + soFuncoes +
    "\nthis.f = { ig: atualizarIG, tfg: atualizarTFG, dose: atualizarDose, imc: atualizarIMC };", ctx);
  return ctx;
}

const HOJE = new Date(2026, 10, 23).getTime();
const A = carregar(v1, HOJE), B = carregar(v2, HOJE);

// Os blocos de cálculo devem ser idênticos, caractere por caractere
if (bloco(v1, "calculos") !== bloco(v2, "calculos")) { console.error("FALHA: bloco de cálculos diferente da v1"); process.exit(1); }

function rodar(ctx, aba, valores, modo) {
  ctx.modo = modo || "dum";
  for (const k in ctx.campos) ctx.campos[k].value = "";
  Object.assign(ctx.document, {});
  for (const [id, v] of Object.entries(valores)) ctx.document.getElementById(id).value = v;
  const r = ctx.f[aba]();
  return JSON.stringify({ copiar: r.copiar, avisos: r.avisos, alertas: r.alertas || [], temHtml: !!r.html, extra: (r.extra || "").replace(/<[^>]+>/g, "|") });  // agenda: compara o texto, não as classes
}

let total = 0, falhas = 0;
function comparar(aba, valores, modo) {
  total++;
  const a = rodar(A, aba, valores, modo), b = rodar(B, aba, valores, modo);
  if (a !== b) {
    falhas++;
    if (falhas <= 10) console.error("DIFERENÇA", aba, modo || "", JSON.stringify(valores), "\n v1:", a.slice(0, 400), "\n v2:", b.slice(0, 400));
  }
  return JSON.parse(b);
}

// Casos esperados do README da versão 1
const esperados = [
  ["imc", { "imc-peso": "70", "imc-altura": "1,75" }, null, "IMC 22,9 kg/m² (eutrófico)"],
  ["ig", { "ig-dum": "01/01/2026", "ig-ref": "16/06/2026" }, "dum", "IG 23 semanas e 05 dias, 2º trimestre. DPP 08/10/2026."],
  ["tfg", { "tfg-cr": "1,0", "tfg-idade": "50", "tfg-sexo": "M" }, null, "TFGe 92 mL/min/1,73 m² (CKD-EPI 2021), estágio G1"],
  ["tfg", { "tfg-cr": "0,6", "tfg-idade": "60", "tfg-sexo": "F" }, null, "TFGe 103 mL/min/1,73 m² (CKD-EPI 2021), estágio G1"],
  ["tfg", { "tfg-cr": "1,0", "tfg-idade": "50", "tfg-sexo": "M", "tfg-peso": "70" }, null, "TFGe 92 mL/min/1,73 m² (CKD-EPI 2021), estágio G1. ClCr 88 mL/min (Cockcroft-Gault, peso 70 kg)"],
  ["dose", { "dose-peso": "20", "dose-mgkg": "50", "dose-tomadas": "3", "dose-conc": "50" }, null, "Dose: 20 kg × 50 mg/kg/dia = 1000 mg/dia. 333 mg por tomada, 3x/dia (8/8 h) = 6,7 mL por tomada (apresentação 50 mg/mL)."]
];
for (const [aba, val, modo, texto] of esperados) {
  const r = comparar(aba, val, modo);
  if (r.copiar !== texto) { falhas++; console.error("ESPERADO", aba, texto, "\n obtido:", r.copiar); }
}

// Valores aleatórios, incluindo vazios, inválidos e nos limites
let semente = 42;
function aleat() { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; }
function escolha(l) { return l[Math.floor(aleat() * l.length)]; }
function num(min, max, casas) { const n = min + aleat() * (max - min); return (casas ? n.toFixed(casas) : String(Math.round(n))).replace(".", escolha([",", "."])); }
const lixo = ["", "", "abc", "-5", "1,2,3", " ", "0", "1e3", ".5"];
function ou(v) { return aleat() < 0.12 ? escolha(lixo) : v; }
function data() {
  if (aleat() < 0.1) return escolha(["31/02/2026", "1/1/26", "01012026", "32/01/2026", "01/13/2026", "01-01-2026", "01/01/26"]);
  const d = new Date(2025, 0, 1 + Math.floor(aleat() * 800));
  return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
}

for (let i = 0; i < 4000; i++) {
  comparar("imc", { "imc-peso": ou(num(0, 420, escolha([0, 1]))), "imc-altura": ou(escolha([num(0.2, 2.8, 2), num(20, 280, 0)])) });
  comparar("tfg", { "tfg-cr": ou(num(0, 22, 2)), "tfg-idade": ou(num(0, 125, 0)), "tfg-sexo": escolha(["", "F", "M"]), "tfg-peso": aleat() < 0.4 ? "" : ou(num(0, 420, 1)) });
  comparar("dose", { "dose-peso": ou(num(0, 160, 1)), "dose-mgkg": ou(num(0, 120, escolha([0, 1, 2]))), "dose-tomadas": ou(num(0, 26, escolha([0, 0, 1]))),
                     "dose-conc": aleat() < 0.2 ? "" : ou(num(0, 300, 1)), "dose-max": aleat() < 0.5 ? "" : ou(num(0, 3000, 0)) });
  comparar("ig", { "ig-dum": ou(data()), "ig-ref": aleat() < 0.1 ? "" : data() }, "dum");
  comparar("ig", { "ig-us-data": ou(data()), "ig-us-sem": ou(num(2, 44, escolha([0, 0, 1]))), "ig-us-dias": aleat() < 0.2 ? "" : ou(num(0, 8, 0)), "ig-ref": data() }, "us");
}

console.log((falhas ? "FALHOU" : "OK") + ": " + (total - falhas) + "/" + total + " casos iguais à versão 1" + (falhas ? " (" + falhas + " diferenças)" : ""));
process.exit(falhas ? 1 : 0);
