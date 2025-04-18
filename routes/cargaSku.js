var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
const multer = require("multer");
const path = require("path");
var imp_sku = require("../models/imp_sku");
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
      await processExcel(req.file.path);
      res
        .status(200)
        .send({ message: "Archivo procesado correctamente", ok: true });
    } catch (error) {
      res
        .status(500)
        .send({ error: "Error al procesar el archivo", ok: false });
    }
  }
);

async function processExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Eliminar la primera fila (encabezados)
  jsonData.shift();

  let rowCount = 0;
  // Guardar los datos en la base de datos
  for (const row of jsonData) {
    rowCount++;
    if (!row[0]) {
      break; // Detener el procesamiento si la primera celda está vacía}
    }
    if (row.length == 8) {
      row.push(""); // Agregar un campo vacío si la fila tiene 8 columnas
    }
    if (row.length < 9) {
      console.log("Fila incompleta, se omite:", row);
      continue; // Omitir filas incompletas
    }
    //console.log(rowCount, row);

    try {
      const skuData = {
        sku: row[0].toString(),
        producto: row[1].toString(),
        proteina: row[2].toString(),
        origen: row[3].toString(),
        marca: row[4].toString(),
        proveedor: row[5].toString(),
        estado: row[6].toString(),
        calidad: row[7] ? row[7].toString() : "",
        tipo: row[8] ? row[8].toString() : "",
      };
      const existe = await imp_sku.findOne({
        where: {
          sku: row[0].toString(),
        },
      });
      if (existe) {
        //console.log(skuData.sku);
        await imp_sku.update(skuData, {
          where: {
            sku: row[0].toString(),
          },
        });
      } else {
        await imp_sku.create(skuData);
      }
    } catch (error) {
      console.error("Error al guardar los datos en la base de datos:", error);
      throw error; // Lanza el error para que sea capturado por el bloque catch
    }
  }
  console.log("Datos guardados en la base de datos");
}

module.exports = router;
