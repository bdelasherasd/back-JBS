var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var task = require("../models/task");
var sequelize = require("../models/sequelizeConnection");
const showLog = require("../middleware/showLog");
const enviaCorreo = require("../middleware/enviaCorreo");
const cron = require("node-cron");
const fs = require("fs");
const handlebars = require("handlebars");

const bcrypt = require("bcrypt");

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
    correos: req.sanitize(req.body.correos),
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
        "Inicio Ejecución Programada Notificador de Nuevo Proveedor " +
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
    aplicacion: "NotificaProveedores",
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
    task = task[1];
    if (task > 0) {
      res.send({ error: false, message: "Tarea eliminada" });
      var job_element = tjobs.filter((t) => t.id == data.id);
      job_element[0].job.stop();
      //job_element[0].job.destroy();
      global.tjobs = global.tjobs.filter((t) => t.id !== data.id);
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
        "Inicio Ejecución Programada Notificador de Nuevo Proveedor " +
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

const axios = require("axios");

const first = (second) => {
  third;
};

const procesaAgenda = async (req, res, taskdata) => {
  const source = fs.readFileSync(
    "./views/TemplateEmailProveedores.html",
    "utf8"
  );
  const template = handlebars.compile(source);

  const source2 = fs.readFileSync(
    "./views/TempletaEmailNotificadorSinData.html",
    "utf8"
  );
  const template2 = handlebars.compile(source2);

  console.log("Procesando Notificador...");
  let sql = "";
  sql += "select proveedor from imp_importacions ";
  sql += "where proveedor not in (select proveedor from proveedors)";
  sql += "group by proveedor";

  try {
    let data = await sequelize.query(sql);
    if (data[0].length > 0) {
      const htmlToSend = template({ data: data[0] });
      await enviaCorreo(
        taskdata.correos,
        "Notificador de Proveedres Nuevos",
        htmlToSend
      );
      console.log("Correo enviado a " + taskdata.correos);
    } else {
      const htmlToSend = template2({
        mensaje: "No hay Proveedores nuevos que notificar",
      });
      await enviaCorreo(
        taskdata.correos,
        "Notificador de Proveedores Nuevos",
        htmlToSend
      );
      console.log("Correo enviado a " + taskdata.correos);
    }
  } catch (error) {
    console.log(error.message);
  }
};

exports.NotificaProveedoresRoutes = router;
exports.reprogramaNotificaProveedores = reprograma;
