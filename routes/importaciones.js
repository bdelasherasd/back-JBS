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
  sql += "select top 1000  ";
  sql += "imp_importacions.idImportacion, ";
  sql += "imp_importacions.nroDespacho, ";
  sql += "imp_importacions.tipoTranporte, ";
  sql += "imp_importacions.tipoOperacion, ";
  sql += "imp_importacions.fechaETA, ";
  sql += "imp_importacions.proveedor, ";
  sql += "imp_importacions.regimen, ";
  sql += "imp_importacions.refCliente, ";
  sql += "imp_importacions.impuestoDI, ";
  sql += "imp_importacions.puertoEmbarque, ";
  sql += "imp_importacions.aduana, ";
  sql += "imp_importacions.puertoDescarga, ";
  sql += "imp_importacions.createdAt, ";
  sql += "imp_importacions.updatedAt, ";
  sql += "case imp_importacions.estado ";
  sql += "when '0' then 'Ingresado' ";
  sql += "when '1' then 'Aprobado' ";
  sql += "end estado, ";
  sql += "imp_importacion_archivos.detalles,  ";
  sql += "imp_importacion_archivos.packingList,  ";
  sql += "'true' as valido  ";
  sql += "from imp_importacions left join  ";
  sql += "imp_importacion_archivos on  ";
  sql +=
    "imp_importacions.idImportacion=imp_importacion_archivos.idImportacion  ";
  sql += "order by imp_importacions.idImportacion desc  ";

  try {
    let data = await sequelize.query(sql);
    data = data[0];
    //res.status(200).json({data})

    for (let [index, d] of data.entries()) {
      let hayErrores = false;
      let detalles = JSON.parse(d.detalles);
      if (detalles) {
        for (let e of detalles) {
          if (e.codigoInvalido || e.cantidadInvalida || e.valorInvalido) {
            hayErrores = true;
            break;
          }
          if (e.peso == "0") {
            hayErrores = true;
            break;
          }
        }
      }

      let packingList = JSON.parse(d.packingList);
      if (packingList) {
        for (let e of packingList) {
          if (
            e.vencimientoInvalido ||
            e.pesonetoInvalido ||
            e.pesobrutoInvalido
          ) {
            hayErrores = true;
            break;
          }
        }
      }
      if (hayErrores) {
        data[index].valido = false;
      } else {
        data[index].valido = true;
      }
    }

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

router.post("/apruebaImportacion", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    estado: "1",
    usuarioAprueba: req.sanitize(req.body.usuarioAprueba),
    fechaAprueba: `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
  };
  try {
    let data = await imp_importacion.update(datos, {
      where: {
        idImportacion: datos.idImportacion,
      },
    });
    res.send(data);
  } catch (error) {
    console.log(error.message);
  }
});

router.post("/desapruebaImportacion", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    estado: "0",
    usuarioAprueba: req.sanitize(req.body.usuarioAprueba),
    fechaAprueba: `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
  };
  try {
    let data = await imp_importacion.update(datos, {
      where: {
        idImportacion: datos.idImportacion,
      },
    });
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

  // let imp = await imp_importacion.findOne({
  //   where: {
  //     idImportacion: req.params.id,
  //   },
  // });
  let sql = "";

  // if (imp.proveedor.includes("JBS")) {
  //   sql += "select sku , producto ";
  //   sql += "from imp_skus ";
  //   sql += "where imp_skus.proveedor like '%JBS%' ";
  //   sql += "order by sku ";
  // } else {
  //   sql += "select sku , producto ";
  //   sql += "from imp_skus join ";
  //   sql += "imp_importacions on imp_skus.proveedor=imp_importacions.proveedor ";
  //   sql += "where imp_importacions.idImportacion=" + req.params.id;
  //   sql += "order by sku ";
  // }

  sql += "select sku , producto ";
  sql += "from imp_skus ";
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
    peso: req.sanitize(req.body.peso),
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
      peso: req.body.peso,
      descripcion: "",
      codigoInvalido: false,
      cantidadInvalida: false,
      valorInvalido: false,
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

router.post("/updatePackingList", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    index: req.sanitize(req.body.index),
    descripcion: req.sanitize(req.body.descripcion),
    sif: req.sanitize(req.body.sif),
    fechaVencimiento: req.sanitize(req.body.fechaVencimiento),
    CajasPallet: req.sanitize(req.body.CajasPallet),
    PesoNeto: req.sanitize(req.body.PesoNeto),
    PesoBruto: req.sanitize(req.body.PesoBruto),
  };

  try {
    let resultImp = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.body.idImportacion,
      },
    });

    let det = JSON.parse(resultImp.packingList);
    let item = {
      descripcion: req.sanitize(req.body.descripcion),
      sif: req.sanitize(req.body.sif),
      fechaVencimiento: req.sanitize(req.body.fechaVencimiento),
      CajasPallet: req.sanitize(req.body.CajasPallet),
      PesoNeto: req.sanitize(req.body.PesoNeto),
      PesoBruto: req.sanitize(req.body.PesoBruto),
      vencimientoInvalido: false,
      pesonetoInvalido: false,
      pesobrutoInvalido: false,
    };
    det[req.body.index] = item;
    let detalles = JSON.stringify(det);

    let datos = {
      packingList: detalles,
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
    peso: req.sanitize(req.body.peso),
  };

  try {
    let resultImp = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.body.idImportacion,
      },
    });

    let det = JSON.parse(resultImp.detalles || "[]");
    let item = {
      codigo: req.body.codigo,
      cantidad: req.body.cantidad,
      valor: req.body.valor,
      peso: req.body.peso,
      descripcion: "",
      codigoInvalido: false,
      cantidadInvalida: false,
      valorInvalido: false,
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

router.post("/insertPackingList", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    descripcion: req.sanitize(req.body.descripcion),
    sif: req.sanitize(req.body.sif),
    fechaVencimiento: req.sanitize(req.body.fechaVencimiento),
    CajasPallet: req.sanitize(req.body.CajasPallet),
    PesoNeto: req.sanitize(req.body.PesoNeto),
    PesoBruto: req.sanitize(req.body.PesoBruto),
  };

  try {
    let resultImp = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.body.idImportacion,
      },
    });

    let det = JSON.parse(resultImp.packingList || "[]");
    let item = {
      descripcion: req.sanitize(req.body.descripcion),
      sif: req.sanitize(req.body.sif),
      fechaVencimiento: req.sanitize(req.body.fechaVencimiento),
      CajasPallet: req.sanitize(req.body.CajasPallet),
      PesoNeto: req.sanitize(req.body.PesoNeto),
      PesoBruto: req.sanitize(req.body.PesoBruto),
      vencimientoInvalido: false,
      pesonetoInvalido: false,
      pesobrutoInvalido: false,
    };
    det.push(item);
    let detalles = JSON.stringify(det);

    let datos = {
      packingList: detalles,
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

router.post("/deletePackingList", cors(), async function (req, res) {
  showLog(req, res);

  let datos = {
    idImportacion: req.sanitize(req.body.idImportacion),
    index: req.sanitize(req.body.index),
  };

  try {
    let resultImp = await imp_importacion_archivo.findOne({
      where: {
        idImportacion: req.body.idImportacion,
      },
    });

    let det = JSON.parse(resultImp.packingList);
    det.splice(req.body.index, 1);
    let detalles = JSON.stringify(det);

    let datos = {
      packingList: detalles,
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
