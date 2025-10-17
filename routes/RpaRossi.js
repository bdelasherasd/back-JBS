var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/usuario");
var task = require("../models/task");
var sequelize = require("../models/sequelizeConnection");
var dolarobs = require("../models/dolarobs");
var imp_sku = require("../models/imp_sku");
var imp_csv = require("../models/imp_csv");
var imp_importacion = require("../models/imp_importacion");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
const showLog = require("../middleware/showLog");
const procesaOcrSeara = require("../middleware/procesaOcrSeara");
const procesaOcrJBS = require("../middleware/procesaOcrJBS");
const procesaOcrSWIFT = require("../middleware/procesaOcrSWIFT");
const procesaOcrPILGRIMS = require("../middleware/procesaOcrPILGRIMS");
const procesaOcrMANTIQUEIRA = require("../middleware/procesaOcrMANTIQUIERA");
const procesaOcrVICTORIA = require("../middleware/procesaOcrVICTORIA");
const procesaOcrBOSTON = require("../middleware/procesaOcrBOSTON");
const procesaOcrMEAT = require("../middleware/procesaOcrMEAT");

const cron = require("node-cron");
const { ocrSpace } = require("ocr-space-api-wrapper");
const path = require("path");
const fs = require("fs");
const csv = require("csv-parser");
const xlsx = require("xlsx");

const bcrypt = require("bcrypt");
var nodemailer = require("nodemailer");

require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;
var timeZone = process.env.TIMEZONE;
var pdfApiKey = process.env.APIKEY_PDF;
var urlOCR1 = process.env.URL_OCR1;
var urlOCR2 = process.env.URL_OCR2;
var dias_rpa = process.env.DIAS_RPA || 30;

const permisos = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

router.options("*", async function (req, res) {
  showLog(req, res);
  res.set("Access-Control-Allow-Origin", permisos.origin);
  res.set("Access-Control-Allow-Methods", permisos.methods);
  res.set("Access-Control-Allow-Headers", permisos.allowedHeaders);
  res.send();
});

router.post("/agenda", cors(), async function (req, res) {
  showLog(req, res);
  let taskdata = {
    diaOrig: req.sanitize(req.body.dia),
    dia: req.sanitize(req.body.dia),
    hora: req.sanitize(req.body.hora),
    minuto: req.sanitize(req.body.minuto),
    usuario: req.sanitize(req.body.usuario),
  };

  var diaCron = "";
  if (taskdata.dia == "0") {
    diaCron = "0-6";
  } else {
    diaCron = (Number(taskdata.dia) - 1).toString();
  }

  taskdata.dia = diaCron;

  var cronTime = taskdata.minuto + " " + taskdata.hora + " * * " + taskdata.dia;
  var job = cron.schedule(
    cronTime,
    async function () {
      console.log(
        "Inicio Ejecución Programada " +
          taskdata.hora +
          ":" +
          taskdata.minuto +
          "/" +
          taskdata.dia
      );
      const fechaInicial = new Date();
      fechaInicial.setDate(fechaInicial.getDate() - dias_rpa);
      const fecha = fechaInicial.toISOString().split("T")[0];
      (taskdata["referencia"] = "lote"), (taskdata["fechaDesde"] = fecha);
      console.log("Fecha Desde", fecha);
      await procesaAgenda(req, res, taskdata);
    },
    {
      scheduled: true,
      timezone: timeZone,
    }
  );
  var item = {
    aplicacion: "RpaRossi",
    username: taskdata.usuario,
    hora: taskdata.hora,
    minuto: taskdata.minuto,
    taskdata: JSON.stringify(taskdata),
    res: "",
    dia: taskdata.diaOrig,
  };
  task
    .create(item)
    .then((datanew) => {
      global.tjobs.push({ id: datanew.idTask, job: job });

      console.log("tarea guardada");
      res.send({
        error: false,
        message: "Tarea guardada",
        taskdata: taskdata,
      });
    })
    .catch((err) => {
      console.log(err);
    });
});

router.post("/eliminaagenda", cors(), async function (req, res) {
  let data = {
    id: req.sanitize(req.body.id),
  };
  showLog(req, res);
  let sql = "delete from tasks where idTask = " + data.id;
  try {
    let task = await sequelize.query(sql);
    task = task[0];
    if (task.affectedRows > 0) {
      res.send({ error: false, message: "Tarea eliminada" });
      var job_element = tjobs.filter((t) => t.id == req.params.id);
      job_element[0].job.destroy();
      global.tjobs = global.tjobs.filter((t) => t.id !== req.params.id);
    } else {
      res.send({ error: true, message: "Tarea no encontrada" });
    }
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/listTasks/:usuario", cors(), async function (req, res) {
  showLog(req, res);
  let usuario = req.params.usuario;
  let sql = "";
  if (usuario == "admin") {
    sql += "select * from tasks";
  } else {
    sql += "select * from tasks where (username ='" + usuario + "')";
  }
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      res.send(data);
    } else {
      data = { error: "Tarea no encontrada" };
    }
  } catch (error) {
    console.log(error.message);
  }
});

var reprograma = function (taskdata, idTask) {
  var job = cron.schedule(
    taskdata.minuto + " " + taskdata.hora + " * * " + taskdata.dia,
    function () {
      console.log(
        "Inicio Ejecución Programada RPA " +
          taskdata.hora +
          ":" +
          taskdata.minuto +
          " / " +
          taskdata.dia
      );
      const fechaInicial = new Date();
      fechaInicial.setDate(fechaInicial.getDate() - 30);
      const fecha = fechaInicial.toISOString().split("T")[0];
      console.log("Fecha Desde", fecha);
      (taskdata["referencia"] = "lote"), (taskdata["fechaDesde"] = fecha);
      procesaAgenda(null, null, taskdata);
    },
    {
      scheduled: true,
      timezone: timeZone,
    }
  );
  global.tjobs.push({ id: idTask, job: job });
};

router.get("/procesaAhora/:nroDespacho", cors(), async function (req, res) {
  // await imp_importacion_archivo.destroy({
  //   where: { nroDespacho: req.params.nroDespacho },
  // });

  await procesaAgenda(req, res, { nroDespacho: req.params.nroDespacho });
  res.send({
    error: false,
    message: "Fin Ejecución Programada RPA Rossi",
  });
});

router.get("/procesaLote/:fechaDesde", cors(), async function (req, res) {
  procesaAgenda(req, res, {
    referencia: "lote",
    fechaDesde: req.params.fechaDesde,
  });
});

const { Builder, By, until, Key } = require("selenium-webdriver");
const { Options } = require("selenium-webdriver/firefox");
const downloadDir = path.resolve("./", "pdf");

const options = new Options()
  .setPreference("browser.download.alwaysOpenPanel", false)
  .setPreference("browser.download.folderList", 2)
  .setPreference("browser.download.dir", downloadDir)
  .setPreference("browser.helperApps.neverAsk.saveToDisk", "application/pdf")
  .setPreference("pdfjs.disabled", true)
  .setPreference("browser.download.manager.showWhenStarting", false)
  .setAcceptInsecureCerts(true);

var URLEMPRESA = "https://impo-piero.rossi.cl/login";
var logText = "";
const screen = {
  width: 1360,
  height: 700,
};
var { parseFromString } = require("dom-parser");

const imp_gastos_aduana = require("../models/imp_gastos_aduana");
const { text } = require("stream/consumers");
const { get } = require("http");
var driver;

const procesaAgenda = async (req, res, taskdata) => {
  console.log("Inicio Ejecución Programada RPA Rossi");
  driver = await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(options)
    .build();
  await driver.get(URLEMPRESA);
  await driver.manage().window().setRect(screen);

  var rut = await driver.wait(
    until.elementLocated(By.xpath('//*[@id="username"]')),
    20000
  );
  await rut.sendKeys("19686132-7" + Key.TAB);

  var pwd = await driver.wait(
    until.elementLocated(By.xpath('//*[@id="password"]')),
    20000
  );
  await pwd.sendKeys("JBSrossi1" + Key.TAB);

  var btn = await driver.wait(
    until.elementLocated(By.xpath('//*[@id="form"]/fieldset/button')),
    20000
  );

  await btn.click();

  // Esperar a que la página esté completamente cargada
  // Wait for the page to be fully loaded
  await driver.wait(async () => {
    const readyState = await driver.executeScript("return document.readyState");
    return readyState === "complete";
  }, 20000); // 20 segundos de tiempo máximo

  if (taskdata.referencia == "lote") {
    await procesaDetallesLote(taskdata.fechaDesde);
  } else {
    await recuperaCsv(taskdata.nroDespacho);
    await procesaDetalles(taskdata.nroDespacho);
  }

  await driver.quit();

  console.log("Fin Ejecución Programada RPA Rossi");
  // res.send({
  //   error: false,
  //   message: "Fin Ejecución Programada RPA Rossi",
  // });
};

const saveCsv = async (item) => {
  try {
    let existe = await imp_csv.findOne({
      where: { despacho: item.despacho },
    });
    if (!existe) {
      await imp_csv.create(item);
    } else {
      await imp_csv.update(item, {
        where: { despacho: item.despacho },
      });
    }
  } catch (error) {
    console.log(error);
  }
};

const recuperaCsv = async (nroDespacho) => {
  var btn = await getObjeto('//*[@id="tabla_wrapper"]/div[1]/div[2]/button/i');
  await btn.click();

  await driver.sleep(2000);

  var fileName = await obtenerCsvMasNuevo(downloadDir);
  var filePath = path.join(downloadDir, fileName);

  const results = await procesaCsv(filePath);

  const despachos = [];

  //const despachosConFactura = await getDespachoConFactura();
  const despachosConFactura = [];

  for (let [i, e] of results.entries()) {
    let eta = e["eta"];
    let via = e["via_transporte"].trim();
    if (
      !eta.includes("No Ingresada") &&
      !eta.includes("Pendiente") &&
      via != ""
    ) {
      if (e["despacho"] == nroDespacho) {
        await saveCsv(e);
        despachos.push({
          despacho: e.despacho,
          referencia: e.referencia_cliente,
        });
      }
    }
  }
};

const procesaDetallesLote = async (fechaDesde) => {
  var btn = await getObjeto('//*[@id="tabla_wrapper"]/div[1]/div[2]/button/i');
  await btn.click();

  await driver.sleep(2000);

  var fileName = await obtenerCsvMasNuevo(downloadDir);
  var filePath = path.join(downloadDir, fileName);

  const results = await procesaCsv(filePath);

  const despachos = [];

  //const despachosConFactura = await getDespachoConFactura();
  const despachosConFactura = [];

  for (let [i, e] of results.entries()) {
    let eta = e["eta"];
    let via = e["via_transporte"].trim();
    if (
      !eta.includes("No Ingresada") &&
      !eta.includes("Pendiente") &&
      via != ""
    ) {
      let ano = eta.split("-")[2];
      let mes = eta.split("-")[1];
      let dia = eta.split("-")[0];
      let fecha = ano + "-" + mes + "-" + dia;
      if (fecha >= fechaDesde) {
        let existe = despachosConFactura.find(
          (d) => d.nroDespacho == e.despacho
        );
        if (existe) {
          console.log("Ya existe el despacho", e.despacho);
        } else {
          await saveCsv(e);
          despachos.push({
            despacho: e.despacho,
            referencia: e.referencia_cliente,
          });
        }
      }
    }
  }
  console.log("Despachos registros", despachos.length);

  despachos.sort((a, b) => {
    // Convert to numbers if possible, otherwise compare as strings
    const da = isNaN(a.despacho) ? a.despacho : Number(a.despacho);
    const db = isNaN(b.despacho) ? b.despacho : Number(b.despacho);
    if (da < db) return 1;
    if (da > db) return -1;
    return 0;
  });

  for (let [i, e] of despachos.entries()) {
    await procesaDetalles(e.despacho);
    // let existe = await imp_importacion_archivo.findOne({
    //   where: { nroDespacho: e.despacho },
    // });
    // if (!existe) {
    //   await procesaDetalles(e.referencia);
    // } else {
    //   console.log("Ya existe el despacho", e);
    // }
  }
};

const procesaCsv = async (filePath) => {
  const results = [];

  return new Promise((resolve, reject) => {
    try {
      fs.createReadStream(filePath) // <-- tu archivo CSV
        .pipe(csv())
        .on("data", (data) => results.push(data))
        .on("end", () => {
          resolve(results); // aquí tienes los datos como objetos
        })
        .on("error", (err) => {
          console.error("Error leyendo el archivo:", err);
        });
    } catch (error) {
      console.error("Error procesando el archivo CSV:", error);
    }
  });
};

const procesaXls = async (filePath) => {
  const results = [];

  return new Promise((resolve, reject) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error("El archivo no existe: " + filePath);
      }

      const workbook = xlsx.readFile(filePath);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { defval: "" }); // defval: '' para evitar "undefined"

      resolve(data);
    } catch (error) {
      console.error("Error procesando el archivo CSV:", error);
    }
  });
};

const getDespachoConFactura = async () => {
  let sql = `select nroDespacho from imp_gastos_aduanas where gastosAgencia <> '[]'`;
  let data = await sequelize.query(sql);
  return data[0];
};

const getObjeto = async (xpath) => {
  const randomNumber = Math.floor(Math.random() * (1600 - 1500 + 1)) + 1500;
  var countTryes = 0;
  var maxTryes = 3;
  while (countTryes < maxTryes) {
    try {
      var e = await driver.wait(
        until.elementLocated(By.xpath(xpath)),
        randomNumber
      );
      return e;
    } catch (e) {
      console.log("Esperando objeto ", xpath);
      countTryes++;
      if (countTryes == maxTryes) {
        return null;
      }
    }
  }
};

const procesaDetalles = async (nroDespacho) => {
  console.log("Inicio Ejecución Programada RPA Rossi", nroDespacho);

  var numref = null;
  while (true) {
    try {
      try {
        await numref.clear();
      } catch (e) {
        // Si clear falla, usar combinación de teclas para borrar
        await numref.sendKeys(Key.CONTROL, "a", Key.DELETE);
      }

      await numref.sendKeys(nroDespacho + Key.TAB);
      break;
    } catch (e) {
      numref = await driver.wait(
        until.elementLocated(
          By.xpath('//*[@id="exportar"]/fieldset/div[1]/input')
        ),
        20000
      );
    }
  }
  // Generar un número aleatorio entre 1500 y 2000
  const randomNumber = Math.floor(Math.random() * (2000 - 1500 + 1)) + 1500;
  console.log("Esperando ", randomNumber);
  await driver.sleep(randomNumber);

  while (true) {
    try {
      var btn = await driver.wait(
        until.elementLocated(
          By.xpath('//*[@id="exportar"]/fieldset/div[18]/button')
        ),
        20000
      );
      await btn.click();
      break;
    } catch (e) {
      console.log("Esperando boton buscar");
      await driver.sleep(2000);
    }
  }

  await driver.sleep(2000);

  while (true) {
    try {
      var subtabla = await driver.wait(
        until.elementsLocated(By.xpath('//*[@id="tabla"]')),
        20000
      );
      break;
    } catch (e) {
      console.log("Esperando tabla");
      await driver.sleep(2000);
    }
  }

  var sublinea = 0;
  while (sublinea < subtabla.length) {
    var sublineaHTML = await subtabla[sublinea].getAttribute("innerHTML");
    var dom = parseFromString(sublineaHTML);
    var columnas = dom.getElementsByTagName("td");

    var nroDespacho = columnas[0].textContent.trim();

    var tipoTranporte = "";
    if (columnas[0].innerHTML.includes("fa-plane")) {
      tipoTranporte = "Aerea";
    } else if (columnas[0].innerHTML.includes("fa-anchor")) {
      tipoTranporte = "Maritimo";
    } else {
      tipoTranporte = "Terrestre";
    }

    var tipoOperacion = columnas[1].textContent.trim();
    var fechaETA = columnas[2].textContent.trim();
    var proveedor = columnas[3].textContent
      .trim()
      .split("Regimen Importación")[0];
    var regimen = columnas[3].textContent
      .trim()
      .split("Regimen Importación")[1];

    var refCliente = columnas[4].textContent.trim().split("Impuesto DI")[0];
    var impuestoDI = "";
    try {
      impuestoDI = columnas[4].textContent
        .trim()
        .split("Impuesto DI")[1]
        .replace("USD", "")
        .replace(".", "")
        .trim();
    } catch (error) {
      impuestoDI = "";
    }

    var puertoEmbarque = columnas[5].textContent.trim().split("País Origen")[0];
    var paisEmbarque = columnas[5].textContent.trim().split("País Origen")[1];

    var aduana = columnas[6].textContent.trim().split("Puerto Descarga")[0];
    var puertoDescarga = columnas[6].textContent
      .trim()
      .split("Puerto Descarga")[1];

    var item = {
      nroDespacho: nroDespacho,
      tipoTranporte: tipoTranporte,
      tipoOperacion: tipoOperacion,
      fechaETA: fechaETA,
      proveedor: proveedor,
      regimen: regimen,
      refCliente: refCliente,
      impuestoDI: impuestoDI,
      puertoEmbarque: puertoEmbarque,
      paisEmbarque: paisEmbarque,
      aduana: aduana,
      puertoDescarga: puertoDescarga,
      estado: "0",
      tipoCambioAlternativo: 0,
    };

    await saveImportacion(item);
    console.log("Guardando Importacion", nroDespacho);

    var btn = "";
    if (subtabla.length == 1) {
      btn = await driver.wait(
        until.elementLocated(
          By.xpath(
            "/html/body/div[1]/div[2]/div/div/div/div/div[2]/div/div/div/div/table/tbody/tr/td[9]/div/button"
          )
        ),
        20000
      );
    } else {
      var linea = sublinea + 1;
      btn = await driver.wait(
        until.elementLocated(
          By.xpath(
            `/html/body/div[1]/div[2]/div/div/div/div/div[2]/div/div/div/div/table/tbody/tr/td[${linea}]/div/button`
          )
        ),
        20000
      );
    }
    await btn.click();

    const randomNumber = Math.floor(Math.random() * (2000 - 1500 + 1)) + 1500;
    console.log("Esperando ", randomNumber);
    await driver.sleep(randomNumber);

    console.log("Inicio Ventana Gastos", nroDespacho);
    await procesaVentanaGastos(item.nroDespacho);

    console.log("Inicio Ventana Carga", nroDespacho);
    await procesaVentanaCarga(item.nroDespacho);

    console.log("Inicio Ventana Doctos", nroDespacho);
    await procesaVentanaDoctos(item.nroDespacho);

    let btnCerrarModal = await getObjeto(
      '//*[@id="main-modal"]/div/div/div[3]/button'
    );
    await btnCerrarModal.click();

    sublinea++;
  }

  console.log("Esperando 2 segundos");
  await driver.sleep(2000);
};

const saveImportacion = async (item) => {
  try {
    let existe = await imp_importacion.findOne({
      where: { nroDespacho: item.nroDespacho },
    });
    if (!existe) {
      await imp_importacion.create(item);
    } else {
      delete item.estado;
      delete item.tipoCambioAlternativo;
      await imp_importacion.update(item, {
        where: { nroDespacho: item.nroDespacho },
      });
    }
  } catch (error) {
    console.log(error);
  }
};

const procesaVentanaCarga = async (nroDespacho) => {
  var tabCarga = null;
  while (true) {
    try {
      tabCarga = await driver.wait(
        until.elementLocated(By.xpath('//*[@id="myTab"]/li[3]/a/span')),
        20000
      );
      await tabCarga.click();
      break;
    } catch (e) {
      console.log("Esperando tabCarga");
      await driver.sleep(2000);
    }
  }

  var grupoDetalle = await getObjeto('//*[@id="tCarga"]');
  var grupoDetalleHTML = null;
  var retryes = 0;
  while (true) {
    try {
      grupoDetalleHTML = await grupoDetalle.getAttribute("innerHTML");
      break;
    } catch (e) {
      retryes++;
      if (retryes > 5) {
        console.log("Error al obtener grupoDetalle", e);
        break;
      }
      console.log("Esperando grupoDetalle");
      grupoDetalle = await getObjeto(
        '//*[@id="main-modal"]/div/div/div[2]/div/div/div/div'
      );
      await driver.sleep(1000);
    }
  }
  var fechaETA = "";
  var t = "";
  try {
    t = grupoDetalleHTML.split("Fecha Llegada")[1].split("Fecha Liberación")[0];
    var fechaMatch = t.match(/\d{2}-\d{2}-\d{4}/);
    if (fechaMatch) {
      fechaETA = fechaMatch[0];
    }
  } catch (error) {
    t = "";
  }
  console.log("Fecha ETA", fechaETA);
  await imp_importacion.update(
    { fechaETA: fechaETA },
    { where: { nroDespacho: nroDespacho } }
  );
};

const procesaVentanaDoctos = async (nroDespacho) => {
  let existe = await imp_importacion_archivo.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (existe) {
    console.log("Ya existe el despacho", nroDespacho);
    return;
  }

  var tabDoctos = null;
  while (true) {
    try {
      tabDoctos = await driver.wait(
        until.elementLocated(By.xpath('//*[@id="myTab"]/li[6]/a/span')),
        20000
      );
      await tabDoctos.click();
      break;
    } catch (e) {
      console.log("Esperando tabDoctos");
      await driver.sleep(2000);
    }
  }

  var tablaArchivos = await driver.wait(
    until.elementsLocated(
      By.xpath('//*[@id="contenedor-archivos"]/div/div/table/tbody/tr')
    ),
    20000
  );

  //  var Archivos = [];
  let indiceArchivo = 0;
  for ([indice, e] of tablaArchivos.entries()) {
    var sublineaHTML = await e.getAttribute("innerHTML");
    var dom = parseFromString(sublineaHTML);
    var columnas = dom.getElementsByTagName("td");

    if (
      columnas[0].textContent.trim().toUpperCase().includes("NO POSEE ARCHIVOS")
    ) {
      indiceArchivo = -1;
      break;
    }

    if (columnas[0].textContent.trim().toUpperCase().includes("FULL")) {
      indiceArchivo = indice + 1;
      break;
    }
  }

  if (indiceArchivo <= 0) {
    return;
  }

  var nombreArchivo = await driver.wait(
    until.elementLocated(
      By.xpath(
        `//*[@id="contenedor-archivos"]/div/div/table/tbody/tr[${indiceArchivo}]/td[2]`
      )
    ),
    20000
  );

  await nombreArchivo.click();

  var fileName = await obtenerPdfMasNuevo(downloadDir);
  var filePath = path.join(downloadDir, fileName);

  var res = await ocrSpace(filePath, {
    apiKey: pdfApiKey,
    ocrUrl: urlOCR2,
    language: "spa",
    scale: true,
    isTable: true,
    detectOrientation: true,
    OCREngine: 2,
  });

  var resPL = await ocrSpace(filePath, {
    apiKey: pdfApiKey,
    ocrUrl: urlOCR2,
    language: "spa",
    scale: true,
    isTable: true,
    detectOrientation: true,
    OCREngine: 1,
  });

  var item = {
    idImportacion: await getIdImportacion(nroDespacho),
    nroDespacho: nroDespacho,
    nombreArchivo: fileName,
    ocrArchivo: JSON.stringify(res),
    ocrArchivoPL: JSON.stringify(resPL),
  };

  await saveArchivos(item);

  console.log("Nombre Archivo", fileName);
};

const dataCsv = async (nroDespacho) => {
  let rCsv = await imp_csv.findOne({
    where: { despacho: nroDespacho },
  });
  let tipoTransporte = "";
  if (rCsv) {
    if (rCsv.via_transporte.includes("AERE")) {
      tipoTransporte = "Aerea";
    } else if (rCsv.via_transporte.includes("MARIT")) {
      tipoTransporte = "Maritimo";
    } else {
      tipoTransporte = "Terrestre";
    }
    await imp_importacion.update(
      {
        tipoTranporte: tipoTransporte,
      },
      { where: { nroDespacho: nroDespacho } }
    );
  }
};

const saveArchivos = async (item) => {
  await dataCsv(item.nroDespacho);

  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: item.nroDespacho },
    });
    if (!existe) {
      await imp_importacion_archivo.create(item);
      let dataImportacion = await imp_importacion.findOne({
        where: { nroDespacho: item.nroDespacho },
      });
      if (dataImportacion.proveedor.toUpperCase().includes("SEARA")) {
        await procesaOcrSeara(
          JSON.parse(item.ocrArchivo),
          JSON.parse(item.ocrArchivoPL),
          item.nroDespacho
        );
      } else if (dataImportacion.proveedor.toUpperCase().includes("JBS")) {
        await procesaOcrJBS(JSON.parse(item.ocrArchivo), item.nroDespacho);
      } else if (dataImportacion.proveedor.toUpperCase().includes("SWIFT")) {
        await procesaOcrSWIFT(
          JSON.parse(item.ocrArchivo),
          JSON.parse(item.ocrArchivoPL),
          item.nroDespacho
        );
      } else if (dataImportacion.proveedor.toUpperCase().includes("PILGRIMS")) {
        await procesaOcrPILGRIMS(
          JSON.parse(item.ocrArchivo),
          JSON.parse(item.ocrArchivoPL),
          item.nroDespacho
        );
      } else if (
        dataImportacion.proveedor.toUpperCase().includes("MANTIQUEIRA")
      ) {
        await procesaOcrMANTIQUEIRA(
          JSON.parse(item.ocrArchivo),
          JSON.parse(item.ocrArchivoPL),
          item.nroDespacho
        );
      } else if (dataImportacion.proveedor.toUpperCase().includes("VICTORIA")) {
        await procesaOcrVICTORIA(
          JSON.parse(item.ocrArchivo),
          JSON.parse(item.ocrArchivoPL),
          item.nroDespacho
        );
      } else if (dataImportacion.proveedor.toUpperCase().includes("BOSTON")) {
        await procesaOcrBOSTON(
          JSON.parse(item.ocrArchivo),
          JSON.parse(item.ocrArchivoPL),
          item.nroDespacho
        );
      } else if (dataImportacion.proveedor.toUpperCase().includes("MEAT")) {
        await procesaOcrMEAT(
          JSON.parse(item.ocrArchivo),
          JSON.parse(item.ocrArchivoPL),
          item.nroDespacho
        );
      }
      console.log("Guardando Archivos", item.nombreArchivo);
    }
  } catch (error) {
    console.log(error);
  }
};

async function obtenerPdfMasNuevo(directorio) {
  const archivos = fs
    .readdirSync(directorio)
    .filter((f) => f.endsWith(".pdf"))
    .map((nombre) => {
      const ruta = path.join(directorio, nombre);
      return { nombre, mtime: fs.statSync(ruta).mtime };
    });

  if (archivos.length === 0) return null;

  archivos.sort((a, b) => b.mtime - a.mtime);
  return archivos[0].nombre;
}

async function obtenerCsvMasNuevo(directorio) {
  const archivos = fs
    .readdirSync(directorio)
    .filter((f) => f.endsWith(".csv"))
    .map((nombre) => {
      const ruta = path.join(directorio, nombre);
      return { nombre, mtime: fs.statSync(ruta).mtime };
    });

  if (archivos.length === 0) return null;

  archivos.sort((a, b) => b.mtime - a.mtime);
  return archivos[0].nombre;
}

async function obtenerXlsMasNuevo(directorio) {
  const archivos = fs
    .readdirSync(directorio)
    .filter((f) => f.endsWith(".xls"))
    .map((nombre) => {
      const ruta = path.join(directorio, nombre);
      return { nombre, mtime: fs.statSync(ruta).mtime };
    });

  if (archivos.length === 0) return null;

  archivos.sort((a, b) => b.mtime - a.mtime);
  return archivos[0].nombre;
}

const procesaVentanaGastos = async (nroDespacho) => {
  var tabGastos = null;

  console.log("Inicio Busca datos Factura", nroDespacho, 1);

  var nroFacturaText = "";
  var fechaFacturaText = "";

  var grupoDetalle = await getObjeto('//*[@id="tResumen"]/div[1]');

  console.log("Inicio Busca datos Factura", nroDespacho, 2);

  var grupoDetalleHTML = null;
  var retryes = 0;
  while (true) {
    try {
      grupoDetalleHTML = await grupoDetalle.getAttribute("innerHTML");
      break;
    } catch (e) {
      retryes++;
      if (retryes > 5) {
        console.log("Error al obtener grupoDetalle", e);
        break;
      }
      console.log("Esperando grupoDetalle");
      grupoDetalle = await getObjeto('//*[@id="tResumen"]/div[1]');
      await driver.sleep(1000);
    }
  }

  console.log("Inicio Busca datos Factura", nroDespacho, 3);

  var t = grupoDetalleHTML.split("Factura")[1].split("Notas de Cobro")[0];
  console.log("Inicio Busca datos Factura", nroDespacho, 4);

  var fechaMatch = t.match(/\d{2}-\d{2}-\d{4}/);
  if (fechaMatch) {
    fechaFacturaText = fechaMatch[0];
    var tabgrp = t.replace(/\t/g, "").split("\n");
    let indiceNumero = tabgrp.findIndex((linea) => linea.includes("Número"));
    var nroFacturaText = tabgrp[indiceNumero + 2].trim();
  }

  console.log("Nro Factura", nroFacturaText, "Fecha Factura", fechaFacturaText);

  var fechaGuiaText = "";
  var t = grupoDetalleHTML.split("Guía de Despacho")[1].split("Facturas")[0];
  var fechaMatch = t.match(/\d{2}-\d{2}-\d{4}/);
  if (fechaMatch) {
    fechaGuiaText = fechaMatch[0];
  }

  console.log("Fecha Guia", fechaGuiaText);

  var fechaPagoText = "";
  var t = grupoDetalleHTML
    .split("Fecha de Pago")[1]
    .split("Fecha de Retiro")[0];
  var fechaMatch = t.match(/\d{2}-\d{2}-\d{4}/);
  if (fechaMatch) {
    fechaPagoText = fechaMatch[0];
  }

  console.log("Fecha Pago", fechaPagoText);

  var fechaAceptacionText = "";
  let rCsv = await imp_csv.findOne({
    where: { despacho: nroDespacho },
  });
  if (rCsv) {
    fechaAceptacionText = rCsv.fecha_aceptacion;
  }

  console.log("Lee fechaAceptacion");

  let fileNameUyD = await getFileNameUyd(nroDespacho);

  if (await notieneUyd(nroDespacho)) {
    console.log("Busca objeto UYD");

    var objUyD = null;
    const elements = await driver.findElements(
      By.xpath('//*[@id="tResumen"]/div[2]/div[2]/div/div[3]/div/div[2]/a')
    );
    if (elements.length > 0) {
      console.log("get objeto UYD");
      objUyD = await getObjeto(
        '//*[@id="tResumen"]/div[2]/div[2]/div/div[3]/div/div[2]/a'
      );
      await driver.sleep(2000);
    }

    if (objUyD) {
      console.log("procesa objeto UYD");

      const modalElement = await driver.findElement(
        By.xpath('//*[@id="main-modal"]/div/div/div[2]')
      );
      const tablatarget = await modalElement.findElements(
        By.xpath('//*[@id="tResumen"]/div[2]/div[2]/div/div[3]/div/div[2]/a')
      );
      if (tablatarget.length > 0) {
        const targetElement = await modalElement.findElement(
          By.xpath('//*[@id="tResumen"]/div[2]/div[2]/div/div[3]/div/div[2]/a')
        );
        await driver.sleep(2000);
        await driver.executeScript(
          "arguments[0].scrollIntoView({ block: 'center' });",
          targetElement
        );
        await driver.executeScript(
          "arguments[0].scrollIntoView({ block: 'center' });",
          targetElement
        );
        await driver.executeScript(
          "arguments[0].scrollIntoView({ block: 'center' });",
          targetElement
        );
        await driver.sleep(2000);
        console.log("procesa objeto UYD click");
        await driver.executeScript("arguments[0].click();", targetElement);
        await driver.sleep(2000);
        console.log("procesa objeto UYD pdf");
        fileNameUyD = await obtenerPdfMasNuevo(downloadDir);
      }
    }
  }

  while (true) {
    try {
      tabGastos = await driver.wait(
        until.elementLocated(By.xpath('//*[@id="myTab"]/li[2]/a/span')),
        20000
      );
      await tabGastos.click();
      break;
    } catch (e) {
      console.log("Esperando tabGastos");
      await driver.sleep(2000);
    }
  }

  await driver.sleep(3000);

  var noFacturado = "";
  try {
    const randomNumber = Math.floor(Math.random() * (2000 - 1500 + 1)) + 1500;
    console.log("Esperando si hay gastos", randomNumber);

    var noFacturado = await driver
      .wait(
        until.elementLocated(
          By.xpath('//*[@id="contenedor-costo"]/div/div/p[2]')
        ),
        randomNumber
      )
      .getText();
  } catch (error) {
    console.log("hay gastos");
  }

  if (noFacturado.includes("no está facturado")) {
    var item = {
      idImportacion: await getIdImportacion(nroDespacho),
      nroDespacho: nroDespacho,
      nroReferencia: "",
      nave: "",
      mercaderia: "",
      bultos: "",
      tipocambio: "",
      monedaCif: "",
      valorCif: "",
      MonedaIvaGcp: "",
      valorIvaGcp: "",
      monedaAdValorem: "",
      AdValorem: "",
      MonedaAlmacenaje: "",
      Almacenaje: "",
      nroFactura: nroFacturaText,
      fechaFactura: fechaFacturaText,
      fechaGuia: fechaGuiaText,
      fechaPago: fechaPagoText,
      fechaAceptacion: fechaAceptacionText,
      gastosAgencia: JSON.stringify([]),
      desembolsosAgencia: JSON.stringify([]),
      nombreArchivoUyD: fileNameUyD,
    };
    await saveGastos(item);
    return;
  }

  var nDesp = "";
  try {
    var nDesp = await driver
      .wait(
        until.elementLocated(
          By.xpath(
            '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[1]/div[1]/p/span'
          )
        ),
        4000
      )
      .getText();
  } catch (error) {
    return;
  }
  var nRef = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[1]/div[2]/p/span'
        )
      ),
      20000
    )
    .getText();
  var nave = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[1]/div[3]/p/span'
        )
      ),
      20000
    )
    .getText();

  var mercaderia = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[2]/div[1]/p/span'
        )
      ),
      20000
    )
    .getText();

  var bultos = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[2]/div[2]/p/span'
        )
      )
    )
    .getText();

  var tipocambio = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[3]/div[1]/p/span'
        )
      )
    )
    .getText();

  var monedaCif = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[3]/div[2]/p/span[1]'
        )
      )
    )
    .getText();

  var valorCif = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[3]/div[2]/p/span[2]'
        )
      )
    )
    .getText();

  var MonedaIvaGcp = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[4]/div[1]/p/span[1]'
        )
      )
    )
    .getText();

  var valorIvaGcp = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[4]/div[1]/p/span[2]'
        )
      )
    )
    .getText();

  var monedaAdValorem = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[4]/div[2]/p/span[1]'
        )
      )
    )
    .getText();

  var AdValorem = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[4]/div[2]/p/span[2]'
        )
      )
    )
    .getText();

  var MonedaAlmacenaje = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[4]/div[3]/p/span[1]'
        )
      )
    )
    .getText();

  var Almacenaje = await driver
    .wait(
      until.elementLocated(
        By.xpath(
          '//*[@id="contenedor-costo"]/div/div/div[1]/div/div[4]/div[3]/p/span[2]'
        )
      )
    )
    .getText();

  var tablaGastosAgencia = await driver.wait(
    until.elementsLocated(
      By.xpath('//*[@id="contenedor-costo"]/div/div/div[2]/div/div')
    ),
    20000
  );

  var gastosAgencia = [];

  for (e of tablaGastosAgencia) {
    var sublineaHTML = await e.getAttribute("innerHTML");
    var dom = parseFromString(sublineaHTML);
    var columnas = dom.getElementsByTagName("div");

    var item = {
      nombreGasto: columnas[0].textContent.trim(),
      moneda: columnas[1].textContent.trim().split(" ")[0],
      valor: columnas[1].textContent.trim().split(" ")[1],
    };
    gastosAgencia.push(item);
  }

  // var tablaDesembolsos = await driver.wait(
  //   until.elementsLocated(
  //     By.xpath('//*[@id="contenedor-costo"]/div/div/div[3]/div/div')
  //   ),
  //   20000
  // );
  // var desembolsos = [];

  // for (e of tablaDesembolsos) {
  //   var sublineaHTML = await e.getAttribute("innerHTML");
  //   var dom = parseFromString(sublineaHTML);
  //   var columnas = dom.getElementsByTagName("div");

  //   var item = {
  //     nombreGasto: columnas[0].textContent.trim().replace(/\n/g, ""),
  //     moneda: columnas[1].textContent.trim().split(" ")[0],
  //     valor: columnas[1].textContent.trim().split(" ")[1],
  //   };
  //   desembolsos.push(item);
  // }

  // rescatar tipo de documentos

  var tabDocDesembolsos = await getObjeto('//*[@id="myTab"]/li[5]/a/span');
  await tabDocDesembolsos.click();
  var desembolsos = [];

  var excelDesembolsos = await getObjeto(
    '//*[@id="contenedor-gastos"]/div[1]/div[2]/a[1]'
  );
  if (excelDesembolsos) {
    const elementVisible = await driver.wait(
      until.elementIsVisible(excelDesembolsos),
      5000
    );
    const elementClickable = await driver.wait(
      until.elementIsEnabled(excelDesembolsos),
      5000
    );

    await excelDesembolsos.click();

    var fileName = await obtenerXlsMasNuevo(downloadDir);
    var filePath = path.join(downloadDir, fileName);

    const results = await procesaXls(filePath);

    for (let [i, d] of results.entries()) {
      let afecto = false;
      let proveedor = d.Proveedor.toUpperCase().trim();
      let concepto = d.Conceptos.toUpperCase().trim();
      let td = d.Tipo.toUpperCase().trim();

      if (proveedor.includes("SEREMI") || concepto.includes("THC")) {
        afecto = false;
      } else if (
        td.includes("EXENT") ||
        td.includes("BOLET") ||
        td.includes("HONOR")
      ) {
        afecto = false;
      } else {
        afecto = true;
      }

      var item = {
        nombreGasto: `${d.Conceptos.toUpperCase().trim()} | ${proveedor}`,
        moneda: d.Monto.trim().split(" ")[0],
        valor: d.Monto.trim().split(" ")[2],
        afecto: afecto,
      };
      desembolsos.push(item);
    }
  }
  var item = {
    idImportacion: await getIdImportacion(nroDespacho),
    nroDespacho: nDesp,
    nroReferencia: nRef,
    nave: nave,
    mercaderia: mercaderia,
    bultos: bultos,
    tipocambio: tipocambio,
    monedaCif: monedaCif,
    valorCif: valorCif,
    MonedaIvaGcp: MonedaIvaGcp,
    valorIvaGcp: valorIvaGcp,
    monedaAdValorem: monedaAdValorem,
    AdValorem: AdValorem,
    MonedaAlmacenaje: MonedaAlmacenaje,
    Almacenaje: Almacenaje,
    nroFactura: nroFacturaText,
    fechaFactura: fechaFacturaText,
    fechaGuia: fechaGuiaText,
    fechaPago: fechaPagoText,
    fechaAceptacion: fechaAceptacionText,
    gastosAgencia: JSON.stringify(gastosAgencia),
    desembolsosAgencia: JSON.stringify(desembolsos),
    nombreArchivoUyD: fileNameUyD,
  };
  await saveGastos(item);

  console.log("Guardando Gastos", nDesp);
};

const getIdImportacion = async (nroDespachoI) => {
  try {
    let data = await imp_importacion.findOne({
      where: { nroDespacho: nroDespachoI },
    });
    return data.idImportacion;
  } catch (error) {
    console.log(error);
  }
};

const saveGastos = async (item) => {
  try {
    let existe = await imp_gastos_aduana.findOne({
      where: { nroDespacho: item.nroDespacho },
    });
    if (!existe) {
      await imp_gastos_aduana.create(item);
    } else {
      await imp_gastos_aduana.update(item, {
        where: { nroDespacho: item.nroDespacho },
      });
    }
  } catch (error) {
    console.log(error);
  }
};

router.get("/seara/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);
  let ocr = "";
  let ocrPL = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      ocrPL = JSON.parse(existe.ocrArchivoPL);
      await procesaOcrSeara(ocr, ocrPL, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/jbs/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);

  let ocr = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      await procesaOcrJBS(ocr, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/swift/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);

  let ocr = "";
  let ocrPL = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      ocrPL = JSON.parse(existe.ocrArchivoPL);
      await procesaOcrSWIFT(ocr, ocrPL, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/mantiqueira/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);

  let ocr = "";
  let ocrPL = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      ocrPL = JSON.parse(existe.ocrArchivoPL);
      await procesaOcrMANTIQUEIRA(ocr, ocrPL, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/pilgrims/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);

  let ocr = "";
  let ocrPL = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      ocrPL = JSON.parse(existe.ocrArchivoPL);
      await procesaOcrPILGRIMS(ocr, ocrPL, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/victoria/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);

  let ocr = "";
  let ocrPL = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      ocrPL = JSON.parse(existe.ocrArchivoPL);
      await procesaOcrVICTORIA(ocr, ocrPL, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/boston/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);

  let ocr = "";
  let ocrPL = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      ocrPL = JSON.parse(existe.ocrArchivoPL);
      await procesaOcrBOSTON(ocr, ocrPL, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/meat/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;
  await dataCsv(nroDespacho);

  let ocr = "";
  let ocrPL = "";
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!existe) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
    } else {
      ocr = JSON.parse(existe.ocrArchivo);
      ocrPL = JSON.parse(existe.ocrArchivoPL);
      await procesaOcrMEAT(ocr, ocrPL, nroDespacho);

      res.send({
        error: false,
        message: "OCR as good as possible",
      });
    }
  } catch (error) {
    console.log(error);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

router.get("/reprocesaFaltantes", cors(), async function (req, res) {
  let sql = "";
  sql += "select  ";
  sql += "a.nroDespacho,   ";
  sql += "b.proveedor,   ";
  sql += "a.ocrArchivo,   ";
  sql += "a.ocrArchivoPL   ";
  sql += "from imp_importacion_archivos a  ";
  sql += "join imp_importacions b on b.idImportacion = a.idImportacion ";
  sql += "where detalles = '[]' ";

  let faltantes = await sequelize.query(sql);
  for (let [i, item] of faltantes[0].entries()) {
    if (item.proveedor.toUpperCase().includes("SEARA")) {
      await procesaOcrSeara(
        JSON.parse(item.ocrArchivo),
        JSON.parse(item.ocrArchivoPL),
        item.nroDespacho
      );
    } else if (item.proveedor.toUpperCase().includes("JBS")) {
      await procesaOcrJBS(JSON.parse(item.ocrArchivo), item.nroDespacho);
    } else if (item.proveedor.toUpperCase().includes("SWIFT")) {
      await procesaOcrSWIFT(
        JSON.parse(item.ocrArchivo),
        JSON.parse(item.ocrArchivoPL),
        item.nroDespacho
      );
    } else if (item.proveedor.toUpperCase().includes("PILGRIMS")) {
      await procesaOcrPILGRIMS(
        JSON.parse(item.ocrArchivo),
        JSON.parse(item.ocrArchivoPL),
        item.nroDespacho
      );
    } else if (item.proveedor.toUpperCase().includes("MANTIQUEIRA")) {
      await procesaOcrMANTIQUEIRA(
        JSON.parse(item.ocrArchivo),
        JSON.parse(item.ocrArchivoPL),
        item.nroDespacho
      );
    } else if (item.proveedor.toUpperCase().includes("VICTORIA")) {
      await procesaOcrVICTORIA(
        JSON.parse(item.ocrArchivo),
        JSON.parse(item.ocrArchivoPL),
        item.nroDespacho
      );
    } else if (item.proveedor.toUpperCase().includes("BOSTON")) {
      await procesaOcrBOSTON(
        JSON.parse(item.ocrArchivo),
        JSON.parse(item.ocrArchivoPL),
        item.nroDespacho
      );
    } else if (item.proveedor.toUpperCase().includes("MEAT")) {
      await procesaOcrMEAT(
        JSON.parse(item.ocrArchivo),
        JSON.parse(item.ocrArchivoPL),
        item.nroDespacho
      );
    }
  }
  res.send({
    error: false,
    message: "Reprocesamiento de faltantes completado",
  });
});

router.get("/reprocesaCsv", cors(), async function (req, res) {
  let fileName = await obtenerCsvMasNuevo(downloadDir);
  if (!fileName) {
    res.send({
      error: true,
      message: "No se encontró archivo CSV",
    });
    return;
  }

  let filePath = path.join(downloadDir, fileName);
  console.log("Procesando archivo CSV", filePath);

  const results = await procesaCsv(filePath);

  for (let [i, item] of results.entries()) {
    let existe = await imp_csv.findOne({
      where: { despacho: item.despacho },
    });
    if (!existe) {
      await imp_csv.create(item);
    } else {
      await imp_csv.update(item, {
        where: { despacho: item.despacho },
      });
    }
  }
  res.send({
    error: false,
    message: "Reprocesamiento de CSV completado",
  });
});

const notieneUyd = async (nroDespacho) => {
  let gastos = await imp_gastos_aduana.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (gastos && gastos.nombreArchivoUyD) {
    if (gastos.nombreArchivoUyD.trim() !== "") {
      return false;
    }
  }
  return true;
};

const getFileNameUyd = async (nroDespacho) => {
  let gastos = await imp_gastos_aduana.findOne({
    where: { nroDespacho: nroDespacho },
  });
  if (gastos && gastos.nombreArchivoUyD) {
    if (gastos.nombreArchivoUyD.trim() !== "") {
      return gastos.nombreArchivoUyD;
    }
  }
  return "";
};

router.get(
  "/prorrateaDescuento/:nroDespacho/:monto",
  cors(),
  async function (req, res) {
    let nroDespacho = req.params.nroDespacho;
    let monto = parseFloat(req.params.monto);
    if (isNaN(monto)) {
      res.send({
        error: true,
        message: "Monto inválido",
      });
      return;
    }
    // Lógica para prorratear el descuento
    let data = await imp_importacion_archivo.findOne({
      where: { nroDespacho: nroDespacho },
    });
    if (!data) {
      res.send({
        error: true,
        message: "No existe el despacho",
      });
      return;
    }
    let detalles = JSON.parse(data.detalles);
    if (!Array.isArray(detalles) || detalles.length === 0) {
      res.send({
        error: true,
        message: "No hay detalles para prorratear",
      });
      return;
    }

    let totalPeso = 0;
    let totalValor = 0;
    for (let detalle of detalles) {
      totalPeso += parseFloat(detalle.peso) || 0;
      totalValor += parseFloat(detalle.valor) || 0;
    }
    let totalValorConDescuento = totalValor - monto;

    let totalValorConDescuentoCalculado = 0;
    let descuentoPorKilo = monto / totalPeso;
    for (let detalle of detalles) {
      let descuento = (parseFloat(detalle.peso) || 0) * descuentoPorKilo;
      let valor = (parseFloat(detalle.valor) || 0) - descuento;
      valor = valor.toFixed(2);
      detalle.valor = valor.toString();
      totalValorConDescuentoCalculado += parseFloat(detalle.valor) || 0;
    }
    let diferencia = totalValorConDescuento - totalValorConDescuentoCalculado;
    if (Math.abs(diferencia) > 0.01) {
      // Ajustar el último detalle para compensar la diferencia
      let ultimoDetalle = detalles[detalles.length - 1];
      let ultimoValor = parseFloat(ultimoDetalle.valor) || 0;
      ultimoDetalle.valor = (ultimoValor + diferencia).toFixed(2).toString();
    }
    // Actualizar los detalles en la base de datos
    await imp_importacion_archivo.update(
      { detalles: JSON.stringify(detalles) },
      { where: { nroDespacho: nroDespacho } }
    );

    res.send({
      error: false,
      message: "Descuento prorrateado correctamente",
      detalles: detalles, // Retorna los detalles actualizados
    });
  }
);

router.post("/updateDetalles", cors(), async function (req, res) {
  let { nroDespacho, detalles } = req.body;
  if (!nroDespacho || !detalles) {
    res.send({
      error: true,
      message: "Faltan parámetros",
    });
    return;
  }

  for (let detalle of detalles) {
    let codigo = detalle.codigo || "";
    let sku = await imp_sku.findOne({ where: { sku: codigo } });
    if (!sku) {
      detalle.codigoInvalido = true;
    } else {
      detalle.codigoInvalido = false;
    }
  }

  // Actualizar los detalles en la base de datos
  await imp_importacion_archivo.update(
    { detalles: JSON.stringify(detalles) },
    { where: { nroDespacho: nroDespacho } }
  );

  res.send({
    error: false,
    message: "Detalles actualizados correctamente",
  });
});

router.get("/listCargados/:fecha", cors(), async function (req, res) {
  let fecha = req.params.fecha;
  let sql = "";
  sql += "SELECT nroDespacho";
  sql += "      ,nombreArchivo";
  sql += "      ,createdAt";
  sql += "      ,updatedAt";
  sql += "      ,substring(ocrArchivo, 1, 30) as ocrArchivo";
  sql += "      ,substring(ocrArchivoPL, 1, 30) as ocrArchivoPL";
  sql += "      ,detalles";
  sql += "  FROM imp_importacion_archivos";
  sql += ` where convert(varchar, createdAt, 23) = '${fecha}'`;
  sql += "   and isnull(detalles, '') <> ''";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      let dataOut = [];
      for (let item of data) {
        let detalles = JSON.parse(item.detalles);
        for (let d of detalles) {
          let linea = {
            nroDespacho: item.nroDespacho,
            codigo: d.codigo,
            cantidad: d.cantidad,
            peso: d.peso,
            valor: d.valor,
            codigoInvalido: d.codigoInvalido,
            invoiceNumber: d.invoiceNumber,
          };
          dataOut.push(linea);
        }
      }
      res.send(dataOut);
    } else {
      let dataOut = [];
      let linea = {
        nroDespacho: "",
        codigo: "",
        cantidad: "",
        peso: "",
        valor: "",
        codigoInvalido: "",
        invoiceNumber: "",
      };
      dataOut.push(linea);

      res.send(dataOut);
    }
  } catch (error) {
    console.log(error.message);
    res.send({
      error: true,
      message: "Error en la consulta",
    });
  }
});

exports.RpaRossiRoutes = router;
exports.reprogramaRpaRossi = reprograma;
