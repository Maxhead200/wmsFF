package pro.logoff.wms

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class WmsApplication

fun main(args: Array<String>) {
    runApplication<WmsApplication>(*args)
}
