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
  "/list/:ano/:fechaIncial/:fechaFinal/:nroDespacho",
  cors(),
  async function (req, res) {
    showLog(req, res);
    let ano = req.sanitize(req.params.ano);

    let fechaInicial = req.sanitize(req.params.fechaIncial);
    let fechaFinal = req.sanitize(req.params.fechaFinal);
    let nroDespacho = req.sanitize(req.params.nroDespacho);

    let sql = "";

    sql += "select    ";
    sql += "b.idImportacion,  ";
    sql += "convert(varchar,b.createdAt,105) FechaIngreso,   ";
    sql += "b.nroDespacho,   ";
    sql += "b.refCliente,    ";
    sql += "a.detalles,     ";
    sql += "a.packingList,    ";
    sql += "b.tipoCambioAlternativo,   ";
    sql += "isnull(d.valor, 0) tipoCambioBancoCentral,   ";
    sql += "b.unidadMedida,   ";
    sql +=
      "convert(varchar, convert(date, isnull(i.fecha_pago,'01-01-1990'), 105)) as fechaPago  ";
    sql += "from  imp_importacions b     ";
    sql +=
      "left join imp_importacion_archivos a on a.idImportacion=b.idImportacion    ";
    sql += "left join imp_csvs i on i.despacho=a.nroDespacho  ";
    sql +=
      "left join imp_gastos_aduanas c on c.idImportacion=b.idImportacion    ";
    sql +=
      "left join dolarobs d on d.fecha = convert(varchar, convert(date, isnull(i.fecha_pago,'01-01-1990'), 105))  ";
    sql += "where b.estado=1   ";

    if (nroDespacho === "0") {
      sql += `and convert(varchar, b.createdAt, 105) like  '%${ano}%'  `;
      sql += `and convert(date,convert(varchar,b.createdAt,105),105) between '${fechaInicial}' and '${fechaFinal}'  `;
    } else {
      sql += `and b.nroDespacho = '${nroDespacho}'  `;
    }
    sql += "order by a.idImportacion desc ";

    try {
      let lineaExcel = 1;
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
          let TotalPeso = 0;
          for (let det of detalles) {
            TotalPeso += parseFloat(det.peso);
          }
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

            let valorEnPesos = 0;
            if (item.tipoCambioAlternativo != 0) {
              valorEnPesos = parseFloat(det.valor) * item.tipoCambioAlternativo;
            } else {
              valorEnPesos =
                parseFloat(det.valor) * item.tipoCambioBancoCentral;
            }

            let pesoOrigen = parseFloat(det.peso);
            if (item.unidadMedida === "LB") {
              // Convertir de libras a kilogramos
              pesoOrigen = pesoOrigen / 0.45359237; // 1 lb = 0.45359237 kg
            }

            let tc = 0;
            if (item.tipoCambioAlternativo != 0) {
              tc = item.tipoCambioAlternativo;
            } else {
              tc = item.tipoCambioBancoCentral;
            }

            lineaExcel++;
            dataOut.push({
              bodega: "Historico",
              codigo: det.codigo,
              producto: det.producto,
              proteina: det.proteina,
              origen: det.origen,
              marca: det.marca,
              estado: det.estado,
              calidad: det.calidad,
              tipo: det.tipo,
              cliente: "3) STOCK",
              kilos: parseFloat(det.peso),
              costoneto: `=+AE${lineaExcel}`,
              vencimiento: await getVencimiento(item.packingList),
              valorizacionTotal: `=+K${lineaExcel}*L${lineaExcel}`,
              margen3porCiento: `=+L${lineaExcel}/(1-0,03)`,
              margen7porCiento: `=+L${lineaExcel}/(1-0,07)`,
              nroFacturaOrigen: item.refCliente,
              tc: tc,
              fecha: convierteFecha(item.fechaPago),
              cajas: `=+AN${lineaExcel}`,
              Descripciones: "",
              pesoOrigen: pesoOrigen,
              kiloGramos: parseFloat(det.peso),
              porcentajeCarga: (parseFloat(det.peso) * 100) / TotalPeso,
              dolares: parseFloat(det.valor),
              clp: valorEnPesos,
              clpUnitario: `=Z${lineaExcel}/W${lineaExcel}`,
              internacion: `=BUSCARV(CONCAT(D${lineaExcel};E${lineaExcel});'https://d.docs.live.net/Users/Tomas/jbs.cl Dropbox/JBS/TOMAS/[SKU.xlsx]INTERNACIÓN'!$M$5:$N$1048576;2;FALSO)*Z${lineaExcel}`,
              clpMasInternacion: `=+Z${lineaExcel}+AB${lineaExcel}`,
              skuFA: `=CONCAT(B${lineaExcel};Q${lineaExcel})`,
              clpMasInternacionUnitario: `=+AC${lineaExcel}/W${lineaExcel}`,
              dolarUnitarioLibra: `=SI(E${lineaExcel}="USA";Y${lineaExcel}/V${lineaExcel};SI(E${lineaExcel}="CANADA";Y${lineaExcel}/V${lineaExcel};(Y${lineaExcel}/V${lineaExcel})/2,20462))`,
              dorlaUnitarioKilo: `=Y${lineaExcel}/W${lineaExcel}`,
              tcDIN: `=SI(R${lineaExcel}<>"";R${lineaExcel};"")`,
              nroFacturaOrigen2: `=W${lineaExcel}`,
              cajasDeEntrada: parseFloat(det.cantidad),
              pesoPromedio: `=AI${lineaExcel}/AK${lineaExcel}`,
              cajasVendidas: 0,
              cajasDisponibles: `=AK${lineaExcel}-AM${lineaExcel}`,
              kilogramosDisponibles: `=AN${lineaExcel}*AL${lineaExcel}`,
              sintitulo: "3) STOCK",
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

const convierteFecha = (fecha) => {
  let d = fecha.split("-");
  let mes = d[1];
  let mmes = "";
  switch (mes) {
    case "01":
      mmes = "Ene";
      break;
    case "02":
      mmes = "Feb";
      break;
    case "03":
      mmes = "Mar";
      break;
    case "04":
      mmes = "Abr";
      break;
    case "05":
      mmes = "May";
      break;
    case "06":
      mmes = "Jun";
      break;
    case "07":
      mmes = "Jul";
      break;
    case "08":
      mmes = "Ago";
      break;
    case "09":
      mmes = "Sep";
      break;
    case "10":
      mmes = "Oct";
      break;
    case "11":
      mmes = "Nov";
      break;
    case "12":
      mmes = "Dic";
      break;
  }
  return `${mmes}-${d[0]}`;
};

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
