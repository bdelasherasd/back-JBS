var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/usuario");
var task = require("../models/task");
var sequelize = require("../models/sequelizeConnection");
var dolarobs = require("../models/dolarobs");
var imp_sku = require("../models/imp_sku");
var imp_importacion = require("../models/imp_importacion");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
const showLog = require("../middleware/showLog");
const cron = require("node-cron");
const { ocrSpace } = require("ocr-space-api-wrapper");
const path = require("path");
const fs = require("fs");

const bcrypt = require("bcrypt");
var nodemailer = require("nodemailer");

require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;
var timeZone = process.env.TIMEZONE;
var pdfApiKey = process.env.APIKEY_PDF;
var urlOCR1 = process.env.URL_OCR1;
var urlOCR2 = process.env.URL_OCR2;

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
      procesaAgenda(null, null, taskdata);
    },
    {
      scheduled: true,
      timezone: timeZone,
    }
  );
  global.tjobs.push({ id: idTask, job: job });
};

router.get("/procesaAhora/:referencia", cors(), async function (req, res) {
  procesaAgenda(req, res, { referencia: req.params.referencia });
});

const { Builder, By, until, Key } = require("selenium-webdriver");
const { Options } = require("selenium-webdriver/firefox");
const downloadDir = path.resolve("./", "pdf");

const options = new Options()
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
    until.elementLocated(By.xpath('//*[@id="form"]/footer/button')),
    20000
  );

  await btn.click();

  await procesaDetalles(taskdata.referencia);
  await driver.quit();
  res.send({
    error: false,
    message: "Fin Ejecución Programada RPA Rossi",
  });
};

const procesaDetalles = async (referencia) => {
  console.log("Inicio Ejecución Programada RPA Rossi", referencia);

  var numref = null;
  while (true) {
    try {
      await numref.sendKeys(referencia + Key.TAB);
      break;
    } catch (e) {
      numref = await driver.wait(
        until.elementLocated(
          By.xpath('//*[@id="exportar"]/fieldset/div[10]/input')
        ),
        20000
      );
    }
  }

  await driver.sleep(2000);

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
    var impuestoDI = columnas[4].textContent
      .trim()
      .split("Impuesto DI")[1]
      .replace("USD", "")
      .replace(".", "")
      .trim();

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
    };
    await saveImportacion(item);
    console.log("Guardando Importacion", item);

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
    await driver.sleep(2000);

    await procesaVentanaGastos(item.nroDespacho);
    await procesaVentanaDoctos(item.nroDespacho);

    sublinea++;
  }

  console.log("Esperando 3 segundos");
  await driver.sleep(3000);
};

const saveImportacion = async (item) => {
  try {
    let existe = await imp_importacion.findOne({
      where: { nroDespacho: item.nroDespacho },
    });
    if (!existe) {
      await imp_importacion.create(item);
    }
  } catch (error) {
    console.log(error);
  }
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

  var nombreArchivo = await driver.wait(
    until.elementLocated(
      By.xpath('//*[@id="contenedor-archivos"]/div/div/table/tbody/tr[1]/td[2]')
    ),
    20000
  );

  // var ArchivoHTML = await nombreArchivo.getAttribute("innerHTML");
  // var dom = parseFromString(ArchivoHTML);
  // var elemento = dom.getElementsByTagName("a")[0];
  // var fileName = elemento.getAttribute("href");

  await nombreArchivo.click();

  var fileName = await obtenerPdfMasNuevo(downloadDir);
  var filePath = path.join(downloadDir, fileName);

  var res = await ocrSpace(filePath, {
    apiKey: pdfApiKey,
    ocrUrl: urlOCR1,
    language: "eng",
    scale: true,
    isTable: true,
    detectOrientation: false,
    OCREngine: 1,
  });

  var item = {
    idImportacion: await getIdImportacion(nroDespacho),
    nroDespacho: nroDespacho,
    nombreArchivo: fileName,
    ocrArchivo: JSON.stringify(res),
  };

  await saveArchivos(item);

  console.log("Nombre Archivo", fileName);
};

const saveArchivos = async (item) => {
  try {
    let existe = await imp_importacion_archivo.findOne({
      where: { nroDespacho: item.nroDespacho },
    });
    if (!existe) {
      await imp_importacion_archivo.create(item);
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

const procesaVentanaGastos = async (nroDespacho) => {
  var tabGastos = null;
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

  await driver.sleep(2000);

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

  var tablaDesembolsos = await driver.wait(
    until.elementsLocated(
      By.xpath('//*[@id="contenedor-costo"]/div/div/div[3]/div/div')
    ),
    20000
  );
  var desembolsos = [];

  for (e of tablaDesembolsos) {
    var sublineaHTML = await e.getAttribute("innerHTML");
    var dom = parseFromString(sublineaHTML);
    var columnas = dom.getElementsByTagName("div");

    var item = {
      nombreGasto: columnas[0].textContent.trim().replace(/\n/g, ""),
      moneda: columnas[1].textContent.trim().split(" ")[0],
      valor: columnas[1].textContent.trim().split(" ")[1],
    };
    desembolsos.push(item);
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
    gastosAgencia: JSON.stringify(gastosAgencia),
    desembolsosAgencia: JSON.stringify(desembolsos),
  };
  await saveGastos(item);

  console.log("Esperando 5 segundos");
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
    }
  } catch (error) {
    console.log(error);
  }
};

router.get("/seara/:nroDespacho", cors(), async function (req, res) {
  let nroDespacho = req.params.nroDespacho;

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
      await procesaOcr(ocr, nroDespacho);

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

const procesaOcr = async (ocr, nroDespacho) => {
  let data = [];
  let item = {
    cantidad: "0",
    codigo: "",
    descripcion: "",
    valor: "0",
    codigoInvalido: false,
  };

  //Procesa FACTURA COMERCIAL
  //Se busca la pagina que contiene la factura comercial
  //Se busca la tabla que contiene los datos de la factura comercial
  //Se busca la linea que contiene la cantidad y el valor
  //Se busca la linea que contiene el codigo
  //Se guarda la cantidad, el valor y el codigo en el objeto item
  //Se guarda el array data en la base de datos

  let paginasFactura = [];
  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("FACTURA COMERCIAL")) {
      paginasFactura.push(i);
    }
  }

  for (let [j, pagina] of paginasFactura.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      if (texto.includes("CAJAS PALETIZADAS")) {
        let linea = tabla[i - 1].split("\t");

        item.cantidad = linea[0];
        item.valor = linea[linea.length - 2];

        let linea2 = tabla[i].split("\t");
        item.codigo = linea2[linea2.length - 2];

        item.codigoInvalido = await valCodigo(item.codigo);

        data.push(item);
      }
    }
  }

  try {
    await imp_importacion_archivo.update(
      { detalles: JSON.stringify(data) },
      { where: { nroDespacho: nroDespacho } }
    );
  } catch (error) {
    console.log(error);
  }

  //  Procesa PACKING LIST
  //Se busca la pagina que contiene el packing list
  //Se busca la tabla que contiene los datos del packing list

  let paginasPackingList = [];
  let dataPacking = [];

  for (let [i, e] of ocr.ParsedResults.entries()) {
    let texto = e.ParsedText.toUpperCase();
    if (texto.includes("PACKING LIST")) {
      paginasPackingList.push(i);
    }
  }

  for (let [j, pagina] of paginasPackingList.entries()) {
    let tabla = ocr.ParsedResults[pagina].ParsedText.split("\n");

    for (let [i, e] of tabla.entries()) {
      let texto = e.toUpperCase();
      let columnas = texto.split("\t");

      if (texto.includes("VALIDEZ CAIXAS")) {
        let indInicio = i + 1;
        for (let k = indInicio; k < indInicio + 100; k++) {
          if (k >= tabla.length) {
            break;
          }
          let linea = tabla[k].split("\t");
          let item = {
            descripcion: "",
            fechaProduccion: "",
            sif: "",
            fechaVencimiento: "",
            CajasPallet: "",
            PesoNeto: "",
            PesoBruto: "",
          };
          if (linea.length > 5) {
            item.descripcion = linea[0];
            item.fechaProduccion = linea[1];
            item.sif = linea[2];
            item.fechaVencimiento = linea[3];
            item.CajasPallet = linea[4];
            item.PesoNeto = linea[5];
            item.PesoBruto = linea[6];
            dataPacking.push(item);
          }
        }
        try {
          await imp_importacion_archivo.update(
            { packingList: JSON.stringify(dataPacking) },
            { where: { nroDespacho: nroDespacho } }
          );
        } catch (error) {
          console.log(error);
        }
      }
    }
  }
};

const valCodigo = async (codigo) => {
  let existe = await imp_sku.findOne({
    where: { sku: codigo },
  });
  if (!existe) {
    return true;
  } else {
    return false;
  }
};

exports.RpaRossiRoutes = router;
exports.reprogramaRpaRossi = reprograma;
