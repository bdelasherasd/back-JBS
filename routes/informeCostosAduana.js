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
    sql += "a.nroDespacho,  ";
    sql += "a.refCliente,  ";
    sql += "a.tipoTranporte,  ";
    sql += "b.mercaderia,  ";
    sql += "a.paisEmbarque,  ";
    sql += "b.fechaGuia fechaImportacion,  ";
    sql += "a.fechaETA, ";
    sql += "b.fechaPago,  ";
    sql += "b.fechaAceptacion,  ";
    sql += "convert(float,replace(b.tipocambio,',','.')) tipocambio, ";
    sql += "d.valor dolarObservado, ";
    sql += "b.valorCif [USD Importacion], ";
    sql +=
      "b.valorCif*convert(float,replace(b.tipocambio,',','.'))  [CLP Importacion], ";
    sql +=
      "CONVERT(decimal,REPLACE(RTRIM(isnull([valorIvaGcp],'0')),'.',''))  Gcp, ";
    sql += "b.gastosAgencia, ";
    sql += "b.desembolsosAgencia ";
    sql += "from imp_importacions a left join ";
    sql +=
      "imp_gastos_aduanas b on a.idImportacion = b.idImportacion left join ";
    sql +=
      "     imp_importacion_archivos c on a.idImportacion = c.idImportacion left join ";
    sql +=
      "dolarobs d on REPLACE(CONVERT(varchar, d.fecha, 105), '.', '-') = replace(rtrim(b.fechaGuia),'','01-01-1990') ";
    sql += "where b.fechaAceptacion like '%" + ano + "%' ";
    sql += "and b.gastosAgencia <> '[]' ";
    sql += `and convert(date, isnull(b.fechaAceptacion,'01-01-1990'), 105) between '${fechaInicial}' and '${fechaFinal}' `;
    try {
      let data = await sequelize.query(sql);
      data = data[0];
      if (data.length > 0) {
        for (let [i, item] of data.entries()) {
          data[i]["Proteina"] = await getProteina(item.mercaderia);
          let gastos = JSON.parse(item.gastosAgencia);
          let desembolsos = JSON.parse(item.desembolsosAgencia);
          let gastosAgencia = 0;
          let desembolsosAgencia = 0;
          for (let gasto of gastos) {
            gastosAgencia += parseFloat(gasto.valor.replace(/\./g, ""));
          }
          let iva = 0;
          for (let desembolso of desembolsos) {
            desembolsosAgencia += parseFloat(
              desembolso.valor.replace(/\./g, "")
            );
            if (desembolso.afecto) {
              iva += parseFloat(desembolso.valor.replace(/\./g, ""));
            }
          }
          iva = Math.round(iva - iva / 1.19);
          data[i]["CostoBruto"] = desembolsosAgencia;
          data[i]["CostoAduana"] = gastosAgencia;
          data[i]["IVA"] = iva;
          data[i]["TipoTransporte"] = item.tipoTranporte;
          data[i]["CostoImportacionNeto"] =
            desembolsosAgencia + gastosAgencia - iva;
          data[i]["% Importacion"] = redondear(
            (data[i]["CostoImportacionNeto"] / item["CLP Importacion"]) * 100,
            2
          );
        }

        data.forEach((e) => {
          delete e.gastosAgencia;
          delete e.desembolsosAgencia;
        });

        res.send(data);
      } else {
        data = { error: "No hay datos" };
      }
    } catch (error) {
      console.log(error.message);
    }
  }
);

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
