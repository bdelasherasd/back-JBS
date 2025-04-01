var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/usuario");
var task = require("../models/task");
var sequelize = require("../models/sequelizeConnection");
const showLog = require("../middleware/showLog");
const cron = require("node-cron");

const bcrypt = require("bcrypt");
var nodemailer = require("nodemailer");

require("dotenv").config({ path: "variables.env" });

var urlcliente = process.env.URLCLIENTE;

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
    dia: req.sanitize(req.body.dia),
    hora: req.sanitize(req.body.hora),
    minuto: req.sanitize(req.body.minuto),
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
    aplicacion: "apiBancoCentral",
    username: "system",
    hora: req.body.data.hora,
    minuto: req.body.data.minuto,
    taskdata: JSON.stringify(taskdata),
    res: "",
  };
  task
    .create(item)
    .then((datanew) => {
      global.tjobs.push({ id: datanew.idTask, job: job });

      console.log("tarea guardada");
    })
    .catch((err) => {
      console.log(err);
    });
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

const procesaAgenda = async (req, res, taskdata) => {
  console.log("Procesando agenda...");
};

exports.apiBancoCentralRoutes = router;
exports.reprogramaapiBancoCentral = reprograma;
