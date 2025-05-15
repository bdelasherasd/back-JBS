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
    aplicacion: "apiBancoCentral",
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

router.get("/listDolar", cors(), async function (req, res) {
  showLog(req, res);
  let sql =
    "select top 1000 id, convert(varchar, fecha, 23) fecha, valor from dolarobs order by fecha desc";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    if (data.length > 0) {
      res.send(data);
    } else {
      data = { error: "Dolar no encontrado" };
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

const axios = require("axios");

const procesaAgenda = async (req, res, taskdata) => {
  console.log("Procesando dolar banco central...");
  let uid = process.env.API_BCE_USER;
  let pwd = process.env.API_BCE_PWD;
  let { diaInicial, diaFinal } = await getDias();
  let url = `https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx?user=${uid}&pass=${pwd}&firstdate=${diaInicial}&lastdate=${diaFinal}&timeseries=F073.TCO.PRE.Z.D&function=GetSeries`;

  try {
    let response = await axios.get(url, { timeout: 60000 }); // 60 segundos
    await registraDolar(response.data);
    console.log("dolar banco central registrado...");
  } catch (error) {
    console.log("Error al procesar la agenda:", error);
    res.send({
      error: true,
      message: "Error al procesar la agenda",
    });
  }
};

const registraDolar = async (data) => {
  let valores = data.Series.Obs;
  let dataDolar = {};
  let ultimoValorValido = 0;

  for (item of valores) {
    if (item.value != "NaN") {
      ultimoValorValido = Number(item.value);
      dataDolar = {
        fecha: formateaFecha(item.indexDateString),
        valor: Number(item.value),
      };
    } else {
      dataDolar = {
        fecha: formateaFecha(item.indexDateString),
        valor: ultimoValorValido,
      };
    }
    try {
      let existe = await dolarobs.findOne({
        where: { fecha: dataDolar.fecha },
      });
      if (!existe) {
        await dolarobs.create(dataDolar);
      }
    } catch (error) {
      console.log(error);
    }
  }
};

const formateaFecha = (fecha) => {
  const [dia, mes, ano] = fecha.split("-");
  return `${ano}-${mes}-${dia}`;
};

const getDias = async () => {
  let fecha = new Date();
  fecha.setDate(fecha.getDate() + 4);
  let diaFinal = fecha.toISOString().split("T")[0];
  fecha.setDate(fecha.getDate() - 60);
  let diaInicial = fecha.toISOString().split("T")[0];
  return { diaInicial, diaFinal };
};

exports.apiBancoCentralRoutes = router;
exports.reprogramaapiBancoCentral = reprograma;
