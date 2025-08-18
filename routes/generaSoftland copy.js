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
  "/:fechaIncial/:fechaFinal/:nroDespacho",
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
    sql += "isnull(p.codigo , 0 ) codigoProv,    ";
    sql += "a.detalles,     ";
    sql += "a.packingList,    ";
    sql += "b.tipoCambioAlternativo,   ";
    sql += "isnull(d.valor, 0) tipoCambioBancoCentral,   ";
    sql +=
      "convert(varchar, convert(date, isnull(i.fecha_pago,'01-01-1990'), 105)) as fechaPago  ";
    sql += "from  imp_importacions b     ";
    sql +=
      "left join imp_importacion_archivos a     on a.idImportacion=b.idImportacion    ";
    //sql += "left join imp_csvs i on i.despacho=a.nroDespacho  ";
    sql +=
      "inner join imp_csvs i                    on i.despacho=a.nroDespacho  ";
    //sql += `and convert(date,convert(varchar,i.fecha_pago,105),105) between '${fechaInicial}' and '${fechaFinal}'  `;
    sql +=
      "left join imp_gastos_aduanas c           on c.idImportacion=b.idImportacion    ";
    sql +=
      "left join dolarobs d on d.fecha = convert(varchar, convert(date, isnull(i.fecha_pago,'01-01-1990'), 105))  ";
    sql += "left join proveedors p on p.proveedor = b.proveedor ";
    sql += "where b.estado=1   ";
    if (nroDespacho && nroDespacho != "0") {
      sql += `and b.nroDespacho = '${nroDespacho}' `;
    } else {
      sql += `and convert(date,convert(varchar,i.fecha_pago,105),105) between '${fechaInicial}' and '${fechaFinal}'  `;
    }
    //sql += `and convert(date,convert(varchar,i.fechapago,105),105) between '${fechaInicial}' and '${fechaFinal}'  `;
    sql += "order by a.idImportacion desc ";

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
              det.proveedor = item.codigoProv;
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
            let valorfinal = valorEnPesos;
            valorEnPesos = valorEnPesos / parseFloat(det.peso);
            let productoCajas =
              "cajas " + parseFloat(det.cantidad) + ",  " + det.producto;
            let fechaVenc = await getVencimiento(item.packingList);

            if (
              typeof fechaVenc === "string" &&
              fechaVenc.match(/^\d{4}-\d{2}-\d{2}$/)
            ) {
              const [ano, mes, dia] = fechaVenc.split("-");
              fechaVenc = `${dia}-${mes}-${ano}`;
            }

            dataOut.push({
              codigo_de_bodega: "002",
              numero_de_folio_guia_de_entrada: det.invoiceNumber, // item.nroDespacho,
              Fecha_de_generacion_guia_de_entrada: item.FechaIngreso,
              Concepto_de_entrada_a_bodega: "02",
              Descripcion: det.invoiceNumber, //productoCajas,
              Codigo_Proveedor: det.proveedor,
              codigo_de_producto: det.codigo,
              Cantidad_Ingresada: parseFloat(det.peso),
              Precio_Unitario: valorEnPesos,
              Fecha_de_vencimiento: fechaVenc,
              partida: item.nroDespacho,
              numerodefactasociada: item.nroDespacho,
              tipodedocu: "30",
              //codigo_centrocosto:"0",
              //Codigo_de_bodega_origen:"0",
              //Numero_de_guia_despacho_asociada: "0" ,
              //Fecha_guia_despacho_asociada:"0" ,
              //numero_de_factura_n_de_credito_asociada:"0",
              //Sub_tipo_de_factura_asociada:"0",
              //Fecha_de_factura_n_de_credito_asociada:"0",
              //Numero_de_Orden_de_trabajo:"0",
              //Numero_orden_de_produccion:"0",
              //Numero_de_orden_de_Compra:"0",
              //Numero_de_Factura_asociada:"0",
              //Numero_nota_credito_asociada:"0",
              //codigo_de_centro_de_costo_para_contabilizar:"0",
              //total_final: valorfinal,

              //Descripcion: det.producto,

              //valor: parseFloat(det.valor),
              //fecha_de_compra: item.FechaIngreso,
              //Partida_o_talla:"0",
              //Pieza_o_color:"0",

              //Serie:"0",
              //Cuenta_de_consumo:"0",
              //tipo_de_factura:"0",

              //proteina: det.proteina,
              //origen: det.origen,
              //marca: det.marca,
              //proveedor: det.proveedor,
              //estado: det.estado,
              //calidad: det.calidad,
              //tipo: det.tipo,

              //cantidad: parseFloat(det.cantidad),
              //tipoCambioAlternativo: parseFloat(item.tipoCambioAlternativo),
              //tipoCambioBancoCentral: parseFloat(item.tipoCambioBancoCentral),
              //valorEnPesos: valorEnPesos,
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
