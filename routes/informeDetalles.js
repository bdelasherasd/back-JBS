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

router.get(
  "/list/:ano/:fechaIncial/:fechaFinal",
  cors(),
  async function (req, res) {
    showLog(req, res);
    let ano = req.sanitize(req.params.ano);

    let fechaInicial = req.sanitize(req.params.fechaIncial);
    let fechaFinal = req.sanitize(req.params.fechaFinal);

    let sql = "";
    sql += "select  ";
    sql += "b.idImportacion, ";
    sql += "b.nroDespacho, ";
    sql += "b.refCliente, ";
    sql += "a.detalles,  ";
    sql += "a.packingList, ";
    sql +=
      "convert(varchar, convert(date, isnull(c.fechaAceptacion,'01-01-1990'), 105)) as fechaAceptacion ";
    sql += "from imp_importacion_archivos a  ";
    sql += "join imp_importacions b on a.idImportacion=b.idImportacion ";
    sql += "join imp_gastos_aduanas c on c.idImportacion=b.idImportacion ";
    sql += "where b.estado=1 ";
    sql += "and c.fechaAceptacion like '%" + ano + "%' ";
    sql += `and convert(date, isnull(c.fechaAceptacion,'01-01-1990'), 105) between '${fechaInicial}' and '${fechaFinal}' `;

    try {
      let data = await sequelize.query(sql);
      data = data[0];
      let dataOut = [];
      if (data.length > 0) {
        sql =
          "SELECT sku, producto, proteina, origen, marca, proveedor, estado, calidad, tipo FROM imp_skus";
        let dataSku = await sequelize.query(sql);
        dataSku = dataSku[0];

        for (let [i, item] of data.entries()) {
          let detalles = item.detalles ? JSON.parse(item.detalles) : [];

          for (let det of detalles) {
            let skuData = dataSku.find((skuItem) => skuItem.sku === det.codigo);
            if (skuData) {
              det.producto = skuData.producto;
              det.proteina = skuData.proteina;
              det.origen = skuData.origen;
              det.marca = skuData.marca;
              det.proveedor = skuData.proveedor;
              det.estado = skuData.estado;
              det.calidad = skuData.calidad;
              det.tipo = skuData.tipo;
            }

            dataOut.push({
              nroDespacho: item.nroDespacho,
              refCliente: item.refCliente,
              fechaAceptacion: item.fechaAceptacion,
              codigo: det.codigo,
              producto: det.producto,
              proteina: det.proteina,
              origen: det.origen,
              marca: det.marca,
              proveedor: det.proveedor,
              estado: det.estado,
              calidad: det.calidad,
              tipo: det.tipo,
              vecimiento: await getVencimiento(item.packingList),
              cantidad: parseFloat(det.cantidad),
              peso: parseFloat(det.peso),
              valor: parseFloat(det.valor),
            });
          }
        }
        res.send(dataOut);
      } else {
        console.log("No hay datos");
        res.send(data);
      }
    } catch (error) {
      console.log(error.message);
    }
  }
);

const getVencimiento = async (packingList) => {
  if (packingList && packingList.length > 0) {
    let packing = JSON.parse(packingList);
    let menorFecha = null;

    for (let item of packing) {
      if (item.fechaVencimiento) {
        let fecha = new Date(item.fechaVencimiento);
        if (!menorFecha || fecha < menorFecha) {
          menorFecha = fecha;
        }
      }
    }

    if (menorFecha) {
      return menorFecha.toISOString().split("T")[0]; // Formato YYYY-MM-DD
    }
  }
  return "No disponible";
};

const getProteina = async (mercaderia) => {
  if (mercaderia.toUpperCase().includes("POLLO")) {
    return "POLLO";
  } else if (mercaderia.toUpperCase().includes("CERDO")) {
    return "CERDO";
  } else if (mercaderia.toUpperCase().includes("VACUNO")) {
    return "VACUNO";
  } else {
    return "OTRO";
  }
};

function redondear(num, decimales = 2) {
  if (typeof num !== "number" || typeof decimales !== "number") {
    throw new TypeError("Ambos argumentos deben ser números");
  }

  const factor = Math.pow(10, decimales);
  // Usamos Number.EPSILON para evitar errores de precisión como en 1.005
  return Math.round((num + Number.EPSILON) * factor) / factor;
}

module.exports = router;
