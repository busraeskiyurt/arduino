#include<Servo.h>
int a =90;

Servo sevro;

void setup() {
  Serial.begin(9600);
  sevro.attach(8);

  sevro.write(90);  //we move the servo motor to the 90 position at the start

}

void loop() {
  int ldr1 = analogRead(A0);  
  Serial.println(ldr1);
  int ldr2 = analogRead(A1);  
  Serial.println(ldr2);
  delay(100);


  if(ldr1 > 650 && ldr2 < 800){  //As long as a is more than 21, we take the servo motor to "a"position by decreasing "a" one at a time.
    while(a>21){
      a=a-1;
      sevro.write(a);
      delay(50); 
      }
  } 
  if(ldr1 < 650 && ldr2 > 800){  //As long as a is less than 151, we take the servo motor to "a"position by increasing "a" one at a time.
    while(a<151){
      a=a+1;
      sevro.write(a);+,
      delay(50); 
      }
  }
}
