var express = require("express");
var router = express.Router({ mergeParams: true });
var cors = require("cors");
const multer = require("multer");
const path = require("path");
var proveedores = require("../models/proveedor");
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
      res.status(500).send({ error: error.message, ok: false });
    }
  }
);

async function processExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  //const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const jsonData2 = XLSX.utils.sheet_to_json(worksheet);

  let rowCount = 0;
  // Guardar los datos en la base de datos
  for (const row of jsonData2) {
    rowCount++;

    let erroresEncabezado = "";
    if (rowCount === 1) {
      erroresEncabezado = await validaEncabezados(row);
      if (erroresEncabezado !== "") {
        console.error("Error en los encabezados:", erroresEncabezado);
        throw new Error(`Error en los encabezados: ${erroresEncabezado}`);
      }
    }

    if (!row.Codigo) {
      break; // Detener el procesamiento si la primera celda está vacía}
    }
    //console.log(rowCount, row);

    let sku = row.Codigo.toString().trim();
    let proveedor = row.Proveedor ? row.Proveedor.toString().trim() : "";

    try {
      const Data = {
        codigo: sku,
        proveedor: proveedor,
      };
      const existe = await proveedores.findOne({
        where: {
          proveedor: proveedor,
        },
      });
      if (existe) {
        //console.log(skuData.sku);
        await proveedores.update(Data, {
          where: {
            proveedor: proveedor,
          },
        });
      } else {
        await proveedores.create(Data);
      }
    } catch (error) {
      console.error("Error al guardar los datos en la base de datos:", error);
      throw error; // Lanza el error para que sea capturado por el bloque catch
    }
  }
  console.log("Datos guardados en la base de datos");
}

async function validaEncabezados(row) {
  let errores = [];
  if (!row.Codigo) {
    errores.push("Falta el encabezado Codigo");
  }
  if (!row.Proveedor) {
    errores.push("Falta el encabezado Proveedor");
  }

  return errores.join(", ");
}

module.exports = router;
