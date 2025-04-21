var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
var usuario = require("../models/usuario");
var task = require("../models/task");
var sequelize = require("../models/sequelizeConnection");
var dolarobs = require("../models/dolarobs");
var imp_importacion = require("../models/imp_importacion");
var imp_importacion_archivo = require("../models/imp_importacion_archivo");
const showLog = require("../middleware/showLog");

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

router.get("/listImportaciones", cors(), async function (req, res) {
  showLog(req, res);
  let sql = "";
  sql += "select * from imp_importacions";
  try {
    let data = await sequelize.query(sql);
    data = data[0];
    //res.status(200).json({data})
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/listGastosAgencia/:id", cors(), async function (req, res) {
  showLog(req, res);
  let sql = "";
  sql +=
    "select * from imp_gastos_aduanas where idImportacion=" + req.params.id;
  try {
    let data = await sequelize.query(sql);
    data = data[0][0];
    //res.status(200).json({data})
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/listAdicionales/:id", cors(), async function (req, res) {
  showLog(req, res);
  let sql = "";
  sql +=
    "select * from imp_importacion_archivos  where idImportacion=" +
    req.params.id;
  try {
    let data = await sequelize.query(sql);
    data = data[0][0];
    //res.status(200).json({data})
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

module.exports = router;
