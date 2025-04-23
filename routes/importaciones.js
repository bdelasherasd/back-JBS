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

router.get("/getImport/:id", cors(), async function (req, res) {
  showLog(req, res);
  try {
    let data = await imp_importacion.findOne({
      where: {
        idImportacion: req.params.id,
      },
    });
    //res.status(200).json({data})
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/getImportacion/:id", cors(), async function (req, res) {
  showLog(req, res);
  try {
    let data = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.params.id,
      },
    });
    //res.status(200).json({data})
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.get("/listCodigos/:id", cors(), async function (req, res) {
  showLog(req, res);

  let sql = "";
  sql += "select sku , producto ";
  sql += "from imp_skus join ";
  sql += "imp_importacions on imp_skus.proveedor=imp_importacions.proveedor ";
  sql += "where imp_importacions.idImportacion=" + req.params.id;
  sql += "order by sku ";
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

router.post("/updateDetalles", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    index: req.sanitize(req.body.index),
    codigo: req.sanitize(req.body.codigo),
    cantidad: req.sanitize(req.body.cantidad),
    valor: req.sanitize(req.body.valor),
  };

  try {
    let resultImp = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.body.idImportacion,
      },
    });

    let det = JSON.parse(resultImp.detalles);
    let item = {
      codigo: req.body.codigo,
      cantidad: req.body.cantidad,
      valor: req.body.valor,
      descripcion: "",
      codigoInvalido: false,
    };
    det[req.body.index] = item;
    let detalles = JSON.stringify(det);

    let datos = {
      detalles: detalles,
    };

    let result = await imp_importacion_archivo.update(datos, {
      where: { idImportacion: req.sanitize(req.body.idImportacion) },
    });
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

router.post("/insertDetalles", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    codigo: req.sanitize(req.body.codigo),
    cantidad: req.sanitize(req.body.cantidad),
    valor: req.sanitize(req.body.valor),
  };

  try {
    let resultImp = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.body.idImportacion,
      },
    });

    let det = JSON.parse(resultImp.detalles);
    let item = {
      codigo: req.body.codigo,
      cantidad: req.body.cantidad,
      valor: req.body.valor,
      descripcion: "",
      codigoInvalido: false,
    };
    det.push(item);
    let detalles = JSON.stringify(det);

    let datos = {
      detalles: detalles,
    };

    let result = await imp_importacion_archivo.update(datos, {
      where: { idImportacion: req.sanitize(req.body.idImportacion) },
    });
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

router.post("/deleteDetalles", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    index: req.sanitize(req.body.index),
    codigo: req.sanitize(req.body.codigo),
    cantidad: req.sanitize(req.body.cantidad),
    valor: req.sanitize(req.body.valor),
  };

  try {
    let resultImp = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.body.idImportacion,
      },
    });

    let det = JSON.parse(resultImp.detalles);
    det.splice(req.body.index, 1);
    let detalles = JSON.stringify(det);

    let datos = {
      detalles: detalles,
    };

    let result = await imp_importacion_archivo.update(datos, {
      where: { idImportacion: req.sanitize(req.body.idImportacion) },
    });
    result["error"] = false;
    res.send(result);
  } catch (error) {
    console.log({ username: false, error: error.message });
  }
});

module.exports = router;
