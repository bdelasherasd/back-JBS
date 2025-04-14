var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/usuario");
var task = require("../models/task");
var sequelize = require("../models/sequelizeConnection");
var dolarobs = require("../models/dolarobs");
const showLog = require("../middleware/showLog");
const cron = require("node-cron");

const bcrypt = require("bcrypt");
var nodemailer = require("nodemailer");

require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;
var timeZone = process.env.TIMEZONE;

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

var URLEMPRESA = "https://impo-piero.rossi.cl/login";
var logText = "";
var webdriver = require("selenium-webdriver"),
  By = webdriver.By,
  until = webdriver.until;
const screen = {
  width: 1360,
  height: 700,
};
var { parseFromString } = require("dom-parser");

var firefox = require("selenium-webdriver/firefox");
var driver;

const procesaAgenda = async (req, res, taskdata) => {
  console.log("Inicio Ejecución Programada RPA Rossi");
  driver = new webdriver.Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(new firefox.Options().set("acceptInsecureCerts", true))
    .build();

  await driver.get(URLEMPRESA);
  await driver.manage().window().setRect(screen);

  var rut = await driver.wait(
    until.elementLocated(By.xpath('//*[@id="username"]')),
    20000
  );
  await rut.sendKeys("19686132-7" + webdriver.Key.TAB);

  var pwd = await driver.wait(
    until.elementLocated(By.xpath('//*[@id="password"]')),
    20000
  );
  await pwd.sendKeys("JBSrossi1" + webdriver.Key.TAB);

  var btn = await driver.wait(
    until.elementLocated(By.xpath('//*[@id="form"]/footer/button')),
    20000
  );

  await btn.click();
  await driver.sleep(2000);

  await procesaDetalles(taskdata.referencia);

  res.send({
    error: false,
    message: "Inicio Ejecución Programada RPA Rossi",
  });
};

const procesaDetalles = async (referencia) => {
  console.log("Inicio Ejecución Programada RPA Rossi", referencia);

  var numref = null;
  while (true) {
    try {
      await numref.sendKeys(referencia + webdriver.Key.TAB);
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

  var btn = await driver.wait(
    until.elementLocated(
      By.xpath('//*[@id="exportar"]/fieldset/div[18]/button')
    ),
    20000
  );
  await btn.click();

  var subtabla = await driver.wait(
    until.elementsLocated(By.xpath('//*[@id="tabla"]')),
    20000
  );

  var sublinea = 0;
  while (sublinea < subtabla.length) {
    var sublineaHTML = await subtabla[sublinea].getAttribute("innerHTML");
    var dom = parseFromString(sublineaHTML);
    var columnas = dom.getElementsByTagName("td");

    var nroDespacho = columnas[0].textContent.trim();
    var tipoTranporte = columnas[0].innerHTML.includes("fa-truck")
      ? "Terrestre"
      : "Maritimo";
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

    sublinea++;
  }

  console.log("Esperando 10 segundos");
  await driver.sleep(10000);
};

exports.RpaRossiRoutes = router;
exports.reprogramaRpaRossi = reprograma;
