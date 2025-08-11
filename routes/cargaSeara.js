var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
const multer = require("multer");
const path = require("path");
var imp_sku = require("../models/imp_sku");
var imp_carga = require("../models/imp_carga");
const showLog = require("../middleware/showLog");
const XLSX = require("xlsx");
const fs = require("fs");
const { ok } = require("assert");

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

const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (_, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

router.post(
  "/upload",
  cors(),
  upload.single("file"),
  async function (req, res) {
    showLog(req, res);
    try {
      await processExcel(req.file.path, "CIERRES RODOVIARIOS");
      await processExcel(req.file.path, "MARITIMO");
      res
        .status(200)
        .send({ message: "Archivo procesado correctamente", ok: true });
    } catch (error) {
      res.status(500).send({ error: error.message, ok: false });
    }
  }
);

async function processExcel(filePath, sheetName) {
  const workbook = XLSX.readFile(filePath);
  const worksheet = workbook.Sheets[sheetName];

  //const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const jsonData2 = XLSX.utils.sheet_to_json(worksheet, { range: 1 });

  await eliminaExistentes(jsonData2);

  let rowCount = 0;
  // Guardar los datos en la base de datos
  for (const row of jsonData2) {
    rowCount++;

    let erroresEncabezado = "";
    if (rowCount === 1) {
      if (sheetName === "CIERRES RODOVIARIOS") {
        erroresEncabezado = await validaEncabezadosRodoviarios(row);
      }
      if (sheetName === "MARITIMO") {
        erroresEncabezado = await validaEncabezadosMaritimos(row);
      }
      if (erroresEncabezado !== "") {
        console.error("Error en los encabezados:", erroresEncabezado);
        throw new Error(`Error en los encabezados: ${erroresEncabezado}`);
      }
    }

    // if (!row.SKU) {
    //   break; // Detener el procesamiento si la primera celda está vacía}
    // }
    //console.log(rowCount, row);

    if (row.Factura && row.Factura !== "") {
      let peso = "";

      if (sheetName === "CIERRES RODOVIARIOS") {
        peso = row["Peso Liq. Cargado"].toString().trim();
      }

      if (sheetName === "MARITIMO") {
        peso = row["Peso Planeado"].toString().trim();
      }
      try {
        const cargaData = {
          proveedor: "SEARA",
          factura: row.Factura,
          sku: row.Sigla,
          cantidad: row.Cajas,
          peso: peso,
          precio: toFixedExact(
            (parseFloat(row.Precio) * parseFloat(peso)) / 1000,
            2
          ),
        };
        //console.log("Guardando carga:", cargaData);
        // const existe = await imp_carga.findOne({
        //   where: {
        //     factura: cargaData.factura,
        //   },
        // });
        // if (!existe) {
        //   await imp_carga.create(cargaData);
        // }
        await imp_carga.create(cargaData);
      } catch (error) {
        console.error("Error al guardar los datos en la base de datos:", error);
        throw error; // Lanza el error para que sea capturado por el bloque catch
      }
    }
  }
  console.log("Datos guardados en la base de datos");
}

function toFixedExact(num, decimals) {
  const factor = Math.pow(10, decimals);
  // Se suma un pequeño epsilon para contrarrestar errores binarios
  return (Math.round((num + Number.EPSILON) * factor) / factor).toFixed(
    decimals
  );
}

async function eliminaExistentes(jsonData) {
  for (const row of jsonData) {
    if (row.Factura && row.Factura !== "") {
      await imp_carga.destroy({
        where: {
          factura: row.Factura,
        },
      });
    }
  }
}

async function validaEncabezadosRodoviarios(row) {
  let errores = [];
  if (!row.Factura) {
    errores.push("Falta el encabezado Factura");
  }
  if (!row.Sigla) {
    errores.push("Falta el encabezado Sigla");
  }
  if (!row.Precio) {
    errores.push("Falta el encabezado Precio");
  }
  if (!row["Peso Liq. Cargado"]) {
    errores.push("Falta el encabezado Peso Liq. Cargado");
  }
  if (!row.Cajas) {
    errores.push("Falta el encabezado Cajas");
  }

  return errores.join(", ");
}

async function validaEncabezadosMaritimos(row) {
  let errores = [];
  if (!row.Factura) {
    errores.push("Falta el encabezado Factura");
  }
  if (!row.Sigla) {
    errores.push("Falta el encabezado Sigla");
  }
  if (!row.Precio) {
    errores.push("Falta el encabezado Precio");
  }
  if (!row["Peso Planeado"]) {
    errores.push("Falta el encabezado Peso Planeado");
  }
  if (!row.Cajas) {
    errores.push("Falta el encabezado Cajas");
  }

  return errores.join(", ");
}

module.exports = router;
